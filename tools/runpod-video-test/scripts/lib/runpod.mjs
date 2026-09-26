/**
 * FASE 9 / FASE 10 - real job lifecycle against the EXISTING RunPod endpoint.
 *
 * The product provider calls the endpoint's synchronous `/runsync` route with a
 * 30 s timeout, which is far too short for a real image-to-video render. The lab
 * therefore uses the ASYNC route of the very same endpoint (`/run` +
 * `/status/{id}`) so it can report a real job id, never block on one HTTP call,
 * and poll politely.
 *
 * Everything else is reused verbatim from the product code:
 *   - profile/endpoint table  -> `ai-video.profiles.ts`
 *   - request payload         -> `buildRunpodInput()`
 *   - response parsing        -> `RunpodPublicVideoProvider.parseRunpodResponse()`
 */
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { buildProviderInput, parseProviderResponse } from "./api-reuse.mjs";
import { refineProviderInput } from "./prompt.mjs";
import { log } from "./log.mjs";

/** FASE 15 - hard ceiling for this proof of concept. */
export const MAX_RUNPOD_JOBS = 4;

export const TERMINAL_STATUSES = new Set(["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED", "TIMED_OUT"]);

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const FIRST_POLL_MS = 5000;
const MAX_POLL_MS = 15000;
const POLL_BACKOFF = 1.4;
const MAX_TRANSIENT_RETRIES = 1;

/** `.../v2/wan-2-2-i2v-720/runsync` -> `.../v2/wan-2-2-i2v-720` */
export function endpointBase(profileEndpoint) {
  return profileEndpoint.replace(/\/+$/, "").replace(/\/(runsync|run)$/, "");
}

export function endpointId(profileEndpoint) {
  try {
    const url = new URL(endpointBase(profileEndpoint));
    return url.pathname.replace(/^\/v2\//, "");
  } catch {
    return "unknown";
  }
}

class TransientRunpodError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransientRunpodError";
    this.transient = true;
  }
}

function classifyHttp(status, body) {
  if (status === 429 || status === 408 || status >= 500) {
    return new TransientRunpodError(`RunPod HTTP ${status}: ${truncate(body)}`);
  }
  return new Error(`RunPod HTTP ${status}: ${truncate(body)}`);
}

function truncate(text, max = 400) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function isTransient(error) {
  if (error?.transient) return true;
  const message = String(error?.message ?? "").toLowerCase();
  return /econnreset|etimedout|enotfound|fetch failed|socket hang up|network|rate limit|temporarily unavailable/.test(message);
}

async function authorizedFetch(url, { apiKey, method = "GET", body }) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    let text = "";
    try {
      text = await response.text();
    } catch {
      text = "";
    }
    throw classifyHttp(response.status, text);
  }
  return response.json();
}

/**
 * FASE 9 - creates one real asynchronous job.
 * `dryRun` never touches the network.
 */
export async function createJob({ profile, apiKey, imageUrl, prompt, motion, seed, dryRun = false }) {
  const input = refineProviderInput(await buildProviderInput({ imageUrl, prompt, profile, motion, seed }));
  const url = `${endpointBase(profile.endpoint)}/run`;

  if (dryRun) {
    return { jobId: undefined, status: "DRY_RUN", request: { url, input }, input };
  }

  const payload = await authorizedFetch(url, { apiKey, method: "POST", body: { input } });
  const jobId = typeof payload?.id === "string" ? payload.id : undefined;
  if (!jobId) {
    return { jobId: undefined, status: "UNKNOWN", response: safeJobPayload(payload), input, suspicious: "RunPod accepted the request but returned no job id." };
  }
  return { jobId, status: payload.status ?? "IN_QUEUE", input };
}

export async function fetchJobStatus({ profile, apiKey, jobId }) {
  return authorizedFetch(`${endpointBase(profile.endpoint)}/status/${jobId}`, { apiKey });
}

/** Strips signing material out of a provider payload before it is logged. */
export function safeJobPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const clone = JSON.parse(JSON.stringify(payload));
  if (clone.output && typeof clone.output === "object") {
    delete clone.output.video_url;
    delete clone.output.image_url;
  }
  if (typeof clone.image === "string") clone.image = "<public-url>";
  return clone;
}

/**
 * Polls until a terminal status, a timeout, or an abort.
 * Backoff starts at 5 s and grows to 15 s; the endpoint is never hammered.
 */
export async function pollJob({ profile, apiKey, jobId, timeoutMs = DEFAULT_TIMEOUT_MS, onUpdate }) {
  const startedAt = Date.now();
  let interval = FIRST_POLL_MS;
  let polls = 0;
  let lastStatus;

  for (;;) {
    await sleep(interval);
    polls += 1;
    const elapsedMs = Date.now() - startedAt;

    let payload;
    try {
      payload = await fetchJobStatus({ profile, apiKey, jobId });
    } catch (error) {
      if (isTransient(error) && polls <= 3) {
        log.warn(`status poll ${polls} failed transiently (${error.message}); retrying`);
        interval = Math.min(Math.round(interval * POLL_BACKOFF), MAX_POLL_MS);
        continue;
      }
      throw error;
    }

    const status = payload?.status ?? "UNKNOWN";
    if (status !== lastStatus) {
      log.info(`status: ${status} (${(elapsedMs / 1000).toFixed(1)}s)`);
      lastStatus = status;
    }
    onUpdate?.({ status, payload, elapsedMs, polls });

    if (TERMINAL_STATUSES.has(status)) {
      return { payload, status, elapsedMs, polls };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return { payload, status, elapsedMs, polls, timedOut: true };
    }
    interval = Math.min(Math.round(interval * POLL_BACKOFF), MAX_POLL_MS);
  }
}

const VIDEO_EXTENSION = /\.(?:mp4|webm|mov|mkv)(?:\?|#|$)/i;
const URL_KEYS = ["video_url", "videoUrl", "video", "result", "url", "output_url", "file", "mp4"];

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

/**
 * Finds the produced video in a RunPod payload.
 *
 * The product's `parseRunpodResponse()` only understands `output.video_url`, but
 * the public WAN endpoints return `output.result`. Both shapes - and a few other
 * common ones - are accepted here so a completed job's paid output is never lost.
 */
export function extractVideoUrl(payload, depth = 0) {
  const output = depth === 0 ? payload?.output : payload;
  if (isHttpUrl(output)) return { url: output, path: depth === 0 ? "output" : "output.*" };
  if (!output || typeof output !== "object" || depth > 3) return undefined;

  if (Array.isArray(output)) {
    for (const [index, item] of output.entries()) {
      const found = extractVideoUrl(item, depth + 1);
      if (found) return { url: found.url, path: `output[${index}]${found.path === "output.*" ? "" : `.${found.path}`}` };
    }
    return undefined;
  }

  for (const key of URL_KEYS) {
    const value = output[key];
    if (typeof value === "string" && isHttpUrl(value)) return { url: value, path: `output.${key}` };
    if (value && typeof value === "object") {
      const nested = extractVideoUrl(value, depth + 1);
      if (nested) return { url: nested.url, path: `output.${key}.${nested.path}` };
    }
  }

  // Last resort: any string that clearly points at a video file.
  for (const [key, value] of Object.entries(output)) {
    if (isHttpUrl(value) && VIDEO_EXTENSION.test(value)) return { url: value, path: `output.${key}` };
  }
  return undefined;
}

/** Cost is reported by the endpoint as `output.cost`. */
export function readReportedCost(payload) {
  const raw = payload?.output?.cost;
  const cost = Number(raw);
  return Number.isFinite(cost) ? cost : undefined;
}

/**
 * Product parser first (faithful semantics), tolerant extractor second.
 * Never throws for a completed job whose URL simply lives under another key.
 */
export async function parseProviderResult(payload, profile) {
  const cost = readReportedCost(payload);
  let productResult;
  try {
    productResult = await parseProviderResponse(payload, profile);
    if (productResult.videoUrl) {
      return { ...productResult, cost: productResult.cost ?? cost, urlSource: "output.video_url" };
    }
  } catch {
    // The endpoint does not use the key the product expects; fall through.
  }

  const found = extractVideoUrl(payload);
  return {
    provider: "runpod-public",
    model: profile.model,
    status: productResult?.status ?? payload?.status ?? "UNKNOWN",
    runpodJobId: payload?.id,
    videoUrl: found?.url,
    cost,
    duration: profile.duration,
    resolution: profile.resolution,
    urlSource: found?.path
  };
}

/**
 * One real generation: create -> poll -> parse. At most ONE automatic retry, and
 * only for a clearly transient failure (network/429/5xx). A model-level FAILED
 * result is reported as-is and never silently paid for twice.
 */
export async function runJob({ profile, apiKey, imageUrl, prompt, motion, seed, timeoutMs, dryRun, onUpdate }) {
  const startedAt = Date.now();
  let attempt = 0;

  for (;;) {
    attempt += 1;
    try {
      const created = await createJob({ profile, apiKey, imageUrl, prompt, motion, seed, dryRun });
      if (dryRun) {
        return { ...created, elapsedMs: Date.now() - startedAt, attempts: attempt, dryRun: true };
      }
      if (!created.jobId) {
        return { ...created, elapsedMs: Date.now() - startedAt, attempts: attempt, failed: true };
      }

      log.keyValue("job id", created.jobId);
      const polled = await pollJob({ profile, apiKey, jobId: created.jobId, timeoutMs, onUpdate });
      const elapsedMs = Date.now() - startedAt;

      if (polled.timedOut) {
        return {
          jobId: created.jobId,
          status: polled.status,
          elapsedMs,
          attempts: attempt,
          failed: true,
          timedOut: true,
          error: `Timed out after ${(timeoutMs / 60000).toFixed(1)} min (job may still be running on RunPod).`
        };
      }

      if (polled.status === "FAILED" || polled.status === "CANCELLED" || polled.status === "TIMED_OUT") {
        return {
          jobId: created.jobId,
          status: polled.status,
          elapsedMs,
          attempts: attempt,
          failed: true,
          error: polled.payload?.error || `RunPod reported ${polled.status}.`
        };
      }

      // Parsing must never lose the job id: a completed job that this process
      // fails to interpret is still paid for and still downloadable.
      let parsed;
      try {
        parsed = await parseProviderResult(polled.payload, profile);
      } catch (error) {
        return {
          jobId: created.jobId,
          status: polled.status,
          elapsedMs,
          attempts: attempt,
          failed: true,
          error: `Could not read the provider output: ${error.message}`
        };
      }

      return {
        jobId: created.jobId,
        status: polled.status,
        elapsedMs,
        attempts: attempt,
        polls: polled.polls,
        videoUrl: parsed.videoUrl,
        cost: parsed.cost,
        duration: parsed.duration,
        resolution: parsed.resolution,
        model: parsed.model,
        urlSource: parsed.urlSource,
        failed: !parsed.videoUrl,
        error: parsed.videoUrl ? undefined : `Completed job with no recognisable video URL in its output.`
      };
    } catch (error) {
      if (isTransient(error) && attempt <= MAX_TRANSIENT_RETRIES) {
        log.warn(`transient error (${error.message}); one automatic retry`);
        await sleep(4000);
        continue;
      }
      return { jobId: undefined, status: "ERROR", elapsedMs: Date.now() - startedAt, attempts: attempt, failed: true, error: error.message };
    }
  }
}

/** FASE 10 - downloads the finished clip. Retries are free, so they are allowed. */
export async function downloadClip({ videoUrl, destination, attempts = 3 }) {
  await mkdir(path.dirname(destination), { recursive: true });
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(videoUrl, { signal: AbortSignal.timeout(180_000) });
      if (!response.ok || !response.body) {
        throw new Error(`download HTTP ${response.status}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      await rm(destination, { force: true }).catch(() => {});
      if (attempt < attempts) await sleep(2000 * attempt);
    }
  }
  return { ok: false, attempts, error: lastError?.message ?? "download failed" };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function estimateCost(profile, jobs) {
  return Number((profile.estimatedCost * jobs).toFixed(2));
}
