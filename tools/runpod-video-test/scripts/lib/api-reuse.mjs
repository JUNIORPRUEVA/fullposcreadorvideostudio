/**
 * FASE 1 / FASE 2 - reuse of the EXISTING RunPod integration.
 *
 * The lab does not re-implement the provider. It imports the real modules from
 * `apps/api/src/ai-video/` so the endpoints, input contract, response parsing and
 * credential resolution can never silently diverge from the product code.
 *
 * These are TypeScript files, so the lab must be launched with the repo's `tsx`
 * loader. `scripts/run.mjs` re-executes itself with `--import tsx/esm` and the
 * check below fails loudly (instead of guessing) when the loader is absent.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./paths.mjs";

const AI_VIDEO_DIR = path.join(repoRoot, "apps", "api", "src", "ai-video");
const MODULE_BASE = `${pathToFileURL(AI_VIDEO_DIR).href}/`;

export const TSX_LOADER_FLAG = "--import=tsx/esm";

function moduleUrl(fileName) {
  return new URL(fileName, MODULE_BASE).href;
}

let cachedModules;

function loaderMissing(error) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return (
    code === "ERR_UNKNOWN_FILE_EXTENSION" ||
    code === "ERR_MODULE_NOT_FOUND" ||
    /Unknown file extension|Cannot find module|tsx/i.test(message)
  );
}

export function loaderHint(error) {
  return [
    `Could not load the existing TypeScript provider from ${path.relative(repoRoot, AI_VIDEO_DIR)}.`,
    `Underlying error: ${error?.message ?? error}`,
    "",
    "The lab must run through the repository's tsx loader.",
    `Try: node ${TSX_LOADER_FLAG} tools/runpod-video-test/scripts/run.mjs`,
    "or simply: node tools/runpod-video-test/scripts/run.mjs  (the CLI re-executes itself automatically)."
  ].join("\n");
}

/** Imports the real ai-video modules once and memoises them. */
export async function loadAiVideoModules() {
  if (cachedModules) return cachedModules;
  try {
    const [profiles, provider, runpodEnv, r2Env, r2Transport] = await Promise.all([
      import(moduleUrl("ai-video.profiles.ts")),
      import(moduleUrl("runpod-public-video.provider.ts")),
      import(moduleUrl("runpod-env.ts")),
      import(moduleUrl("r2-env.ts")),
      import(moduleUrl("r2-signed-url-ai-asset-transport.ts"))
    ]);
    cachedModules = { profiles, provider, runpodEnv, r2Env, r2Transport };
    return cachedModules;
  } catch (error) {
    if (loaderMissing(error)) {
      const wrapped = new Error(loaderHint(error));
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }
}

/** True when the tsx loader is active and the provider modules can be imported. */
export async function providerModulesReachable() {
  try {
    await loadAiVideoModules();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/**
 * Reads the RunPod credential using the product's own resolution rules
 * (process env first, then `apps/api/.env`). The value is never returned to a
 * caller that logs, and never leaves this process.
 */
export async function readRunpodCredential() {
  const { runpodEnv } = await loadAiVideoModules();
  const apiKey = runpodEnv.readRunpodApiKey();
  return {
    present: Boolean(apiKey),
    apiKey: apiKey || undefined,
    envFilePath: path.join(repoRoot, "apps", "api", ".env")
  };
}

/** Presence-only view of the R2 configuration (no values). */
export async function readR2Presence() {
  const { r2Env } = await loadAiVideoModules();
  return {
    presence: r2Env.r2EnvPresence(),
    configured: Boolean(r2Env.readR2Config())
  };
}

/** The real profile table (endpoints, sizes, duration, estimated cost). */
export async function loadProfiles() {
  const { profiles } = await loadAiVideoModules();
  return profiles.aiVideoProfiles;
}

export async function resolveProfile(profileId) {
  const { profiles } = await loadAiVideoModules();
  return profiles.getAiVideoProfile(profileId);
}

/**
 * Builds the provider payload using the product's own `buildRunpodInput`,
 * guaranteeing identical field names and defaults.
 */
export async function buildProviderInput({ imageUrl, prompt, profile, motion, seed }) {
  const { provider, profiles } = await loadAiVideoModules();
  return provider.buildRunpodInput({
    imageUrl,
    prompt,
    profile,
    duration: profiles.MAX_AI_DURATION_SECONDS,
    motion,
    seed
  });
}

/** Parses a RunPod payload with the product's own response parser. */
export async function parseProviderResponse(payload, profile) {
  const { provider } = await loadAiVideoModules();
  return provider.RunpodPublicVideoProvider.parseRunpodResponse(payload, profile);
}

export async function loadR2Config() {
  const { r2Env } = await loadAiVideoModules();
  return r2Env.readR2Config();
}

export async function createR2Client(config) {
  const { r2Transport } = await loadAiVideoModules();
  return r2Transport.createR2Client(config);
}

export async function signedUrlTtlSeconds() {
  const { r2Transport } = await loadAiVideoModules();
  return r2Transport.R2_SIGNED_URL_TTL_SECONDS;
}
