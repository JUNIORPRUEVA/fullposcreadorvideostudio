#!/usr/bin/env node
/**
 * FullPOS - isolated "RunPod image-to-video + local FFmpeg" proof of concept.
 *
 *   node tools/runpod-video-test/scripts/run.mjs            # full pipeline
 *   node tools/runpod-video-test/scripts/run.mjs --check    # environment audit
 *   node tools/runpod-video-test/scripts/run.mjs --selftest # local pipeline proof
 *
 * See README.md next to this folder. The lab never touches production, and never
 * prints a secret.
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  clipsDir,
  clipsLocalDir,
  finalDir,
  framesDir,
  inputAudioDir,
  inputImagesDir,
  inputLogoDir,
  inputRoot,
  outputRoot,
  relativeToLab,
  relativeToRepo,
  repoRoot,
  tempDir
} from "./lib/paths.mjs";
import { log, redact } from "./lib/log.mjs";
import {
  discoverImageFiles,
  formatBytes,
  validateImages,
  SUPPORTED_EXTENSIONS
} from "./lib/images.mjs";
import {
  MAX_RUNPOD_JOBS,
  downloadClip,
  endpointId,
  estimateCost,
  fetchJobStatus,
  parseProviderResult,
  runJob
} from "./lib/runpod.mjs";
import { cleanupLabObjects, describeSignedUrl, uploadImageForRunpod, r2Ready } from "./lib/r2.mjs";
import { buildLocalClip } from "./lib/deterministic.mjs";
import {
  analyzeFrame,
  compareFrames,
  diffRatio,
  extractFrame,
  ffmpegFilters,
  ffmpegVersion,
  probe,
  requireFfmpeg,
  runFfmpeg,
  tooling
} from "./lib/ffmpeg.mjs";
import { buildFormatsPlan, clearSegments, composeFinalVideo, masterResolution, renderDerived } from "./lib/compose.mjs";
import { captionForImage, parseCaptionOverrides, promptForModel } from "./lib/prompt.mjs";
import { describeRun, findRun, isReusableRun, loadState, recordRun, saveState, stateFilePath } from "./lib/state.mjs";
import { clipReviewPath, finalReviewPath, verifyPageLinks, writeClipReview, writeComparisonPage, writeFinalReview } from "./lib/review.mjs";
import { readR2Presence, readRunpodCredential, providerModulesReachable, resolveProfile, loadProfiles, TSX_LOADER_FLAG } from "./lib/api-reuse.mjs";

const execFileAsync = promisify(execFile);
const TSX_MARKER = "FULLPOS_LAB_TSX_LOADED";
const DEFAULT_MAX_JOBS = MAX_RUNPOD_JOBS;
const CLIP_FRAME_TIMES = [
  { label: "frame-000", fraction: 0, description: "start" },
  { label: "frame-025", fraction: 0.25, description: "25%" },
  { label: "frame-050", fraction: 0.5, description: "50%" },
  { label: "frame-075", fraction: 0.75, description: "75%" },
  { label: "frame-100", fraction: 1, description: "end" }
];

/* ------------------------------------------------------------------ loader -- */

/**
 * The lab reuses the product's TypeScript provider, so it must run with the
 * repository's tsx loader. This shim transparently re-executes the CLI with it,
 * which keeps the documented `node .../run.mjs` command working.
 */
async function ensureTypeScriptLoader() {
  if (process.env[TSX_MARKER] === "1") return { reExecuted: true };

  const { createRequire } = await import("node:module");
  const require = createRequire(path.join(repoRoot, "package.json"));
  let tsxEntry;
  try {
    tsxEntry = require.resolve("tsx/esm");
  } catch {
    return { reExecuted: false, tsx: false };
  }

  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(tsxEntry).href, process.argv[1], ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, [TSX_MARKER]: "1" } }
  );
  process.exit(result.status ?? 1);
}

/* --------------------------------------------------------------------- cli -- */

function parseArgs(argv) {
  const options = {
    command: "pipeline",
    maxJobs: DEFAULT_MAX_JOBS,
    profile: "preview",
    force: false,
    firstOnly: false,
    dryRun: false,
    composeOnly: false,
    deterministic: false,
    motion: "push-in",
    localSeconds: 5,
    localWidth: 1280,
    localHeight: 720,
    timeoutMin: 15,
    formats: [],
    open: true,
    keepR2: false,
    music: undefined,
    logo: undefined,
    help: false
  };

  const flagsWithValue = new Set(["--max-jobs", "--profile", "--timeout-min", "--formats", "--music", "--logo", "--jobs", "--motion", "--local-seconds"]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [flag, inlineValue] = token.includes("=") ? token.split(/=(.*)/s, 2) : [token, undefined];
    const next = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      return argv[index];
    };

    switch (flag) {
      case "--deterministic":
        options.deterministic = true;
        break;
      case "--motion":
        options.motion = next();
        break;
      case "--local-seconds":
        options.localSeconds = Number(next());
        break;
      case "--compare":
        options.command = "compare";
        break;
      case "--check":
        options.command = "check";
        break;
      case "--selftest":
        options.command = "selftest";
        break;
      case "--review":
        options.command = "review";
        break;
      case "--recover":
        options.command = "recover";
        break;
      case "--compose-only":
        options.composeOnly = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--first-only":
        options.firstOnly = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--open":
        options.open = true;
        break;
      case "--no-open":
        options.open = false;
        break;
      case "--keep-r2":
        options.keepR2 = true;
        break;
      case "--no-music":
        options.music = null;
        break;
      case "--no-logo":
        options.logo = null;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (!flagsWithValue.has(flag)) {
          throw new Error(`unknown option: ${flag}`);
        }
        options[camel(flag)] = next();
        break;
    }
  }

  options.maxJobs = Number(options.maxJobs);
  options.timeoutMin = Number(options.timeoutMin);
  options.formats = String(options.formats || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return options;
}

function camel(flag) {
  return flag
    .replace(/^--/, "")
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printHelp() {
  log.raw(`
FullPOS RunPod video lab - isolated POC (no Video Studio code is touched).

Usage
  node tools/runpod-video-test/scripts/run.mjs [options]

Commands
  (default)        Discover images, generate clips with RunPod, compose the final
                   video locally with FFmpeg and write the review pages.
  --check          Audit the environment: internals, credential presence, R2,
                   FFmpeg, provider endpoints. No network, no cost.
  --deterministic  Skip RunPod entirely: build the clips locally by animating the
                   REAL screenshots with FFmpeg motion. Zero cost, and the
                   interface text stays pixel-exact (no model can alter it).
                   Options: --motion push-in|push-in-up --local-seconds N
  --selftest       Prove the local half of the pipeline (frames, composition,
                   review pages) with synthetic assets. No RunPod, no cost.
  --compare        Build an A/B page: the same screens animated by RunPod vs by
                   deterministic FFmpeg motion, with measured drift from the
                   original pixels. Free.
  --review         Rebuild the review pages from artefacts already on disk.
  --recover        Re-download clips for jobs that already ran but whose files are
                   missing (free - it only re-reads the job status).
                   Usage: --recover --jobs "01-facturacion.png=<jobId>,02-....png=<jobId>"
  --compose-only   Skip generation; assemble from clips already on disk.

Options
  --max-jobs N         Jobs to spend this run (default ${DEFAULT_MAX_JOBS}, hard cap ${MAX_RUNPOD_JOBS}).
  --profile ID         preview | premium | premium-1080p (default preview).
  --first-only         FASE 7 gate: generate only the first clip, then stop.
  --force              Regenerate clips that are already completed and valid.
  --dry-run            Build and print the request without calling RunPod.
  --timeout-min N      Polling timeout per job (default 15).
  --formats a,b        Also render derived formats, e.g. 9:16,1:1 (16:9 is master).
  --music PATH         Use a specific audio file. --no-music disables music.
  --logo PATH          Use a specific logo. --no-logo disables the logo.
  --keep-r2            Do not delete the lab's temporary R2 objects afterwards.
  --no-open            Do not open the review page in a browser.
  --help               This text.
`);
}

/* ---------------------------------------------------------------- helpers -- */

async function ensureDirectories() {
  for (const dir of [
    inputImagesDir,
    inputLogoDir,
    inputAudioDir,
    clipsDir,
    clipsLocalDir,
    framesDir,
    finalDir,
    tempDir
  ]) {
    await mkdir(dir, { recursive: true });
  }
}

async function gitSnapshot() {
  try {
    const [{ stdout: branch }, { stdout: head }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["branch", "--show-current"], { cwd: repoRoot }),
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }),
      execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot })
    ]);
    return { branch: branch.trim(), head: head.trim(), dirtyFiles: status.split(/\r?\n/).filter(Boolean).length };
  } catch (error) {
    return { error: error.message };
  }
}

async function firstExistingFile(dir, extensions) {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = (await readdir(dir)).filter((name) => extensions.includes(path.extname(name).toLowerCase())).sort();
    return entries.length > 0 ? path.join(dir, entries[0]) : undefined;
  } catch {
    return undefined;
  }
}

async function resolveLogo(options) {
  if (options.logo === null) return undefined;
  if (options.logo) return existsSync(options.logo) ? options.logo : undefined;
  return firstExistingFile(inputLogoDir, [".png", ".jpg", ".jpeg", ".webp", ".svg"]);
}

async function resolveMusic(options) {
  if (options.music === null) return undefined;
  if (options.music) return existsSync(options.music) ? options.music : undefined;
  return firstExistingFile(inputAudioDir, [".mp3", ".wav", ".m4a"]);
}

/**
 * Optional `input/captions.json` ({"01-productos.png": "..."}) pins exact wording.
 * A malformed file is reported and ignored - it never aborts a run.
 */
async function loadCaptionOverrides() {
  const file = path.join(inputRoot, "captions.json");
  if (!existsSync(file)) return {};
  let raw = "";
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    log.warn(`could not read input/captions.json: ${error.message}`);
    return {};
  }
  const { overrides, error } = parseCaptionOverrides(raw);
  if (error) {
    log.warn(`input/captions.json ignored - ${error}`);
    return {};
  }
  const count = Object.keys(overrides).length;
  if (count > 0) log.info(`caption overrides loaded from input/captions.json (${count})`);
  return overrides;
}

function waitingForInputMessage() {
  log.raw("");
  log.raw("WAITING FOR INPUT IMAGES");
  log.raw("");
  log.raw("Place screenshots in:");
  log.raw("");
  log.raw(`  ${relativeToRepo(inputImagesDir)}/`);
  log.raw("");
  log.raw("Accepted:  PNG / JPG / JPEG / WEBP");
  log.raw("Recommended naming:");
  log.raw("");
  log.raw("  01-...png   02-...png   03-...png   04-...png");
  log.raw("");
  log.raw("Files are used in alphabetical order, which becomes the narrative order.");
  log.raw("");
}

/* ------------------------------------------------------------ frame tools -- */

async function extractClipFrames({ clipPath, duration, index, mode = "runpod", force = true }) {
  const directory = path.join(framesDir, mode, String(index).padStart(2, "0"));
  await mkdir(directory, { recursive: true });
  const frames = [];
  for (const spec of CLIP_FRAME_TIMES) {
    const time = spec.fraction >= 1 ? Math.max(0, duration - 0.06) : duration * spec.fraction;
    const output = path.join(directory, `${spec.label}.png`);
    if (force || !existsSync(output)) {
      await extractFrame({ input: clipPath, timeSeconds: time, output, label: `frame ${spec.label}` });
    }
    frames.push({ ...spec, path: output, time: Number(time.toFixed(3)) });
  }
  return { directory, frames };
}

async function extractFinalFrames({ videoPath, duration, count = 7, mode = "runpod" }) {
  const directory = path.join(framesDir, mode, "final");
  await mkdir(directory, { recursive: true });
  const frames = [];
  for (let position = 0; position < count; position += 1) {
    const fraction = position / (count - 1);
    const time = fraction >= 1 ? Math.max(0, duration - 0.06) : duration * fraction;
    const label = `final-${String(position).padStart(2, "0")}`;
    const output = path.join(directory, `${label}.png`);
    await extractFrame({ input: videoPath, timeSeconds: time, output, label: `final frame ${label}` });
    frames.push({ label: `${label} | t=${time.toFixed(2)}s`, path: output, time: Number(time.toFixed(3)) });
  }
  return { directory, frames };
}

/** Deterministic technical analysis: black/flat frames and motion between frames. */
async function analyzeFrameSet(frames) {
  const analyses = [];
  for (const frame of frames) {
    analyses.push({ frame, result: await analyzeFrame(frame.path) });
  }
  const diffs = [];
  for (let index = 1; index < frames.length; index += 1) {
    diffs.push(await compareFrames(frames[index - 1].path, frames[index].path));
  }

  const blackFrames = analyses.filter((item) => item.result.black).map((item) => item.frame.label);
  const flatFrames = analyses.filter((item) => item.result.flat).map((item) => item.frame.label);
  const undefinedFrames = analyses.filter((item) => !item.result.ok).map((item) => item.frame.label);
  const maxDiff = diffs.reduce((max, item) => Math.max(max, item.meanAbsDiff ?? 0), 0);

  return {
    analyses,
    diffs,
    blackFrames,
    flatFrames,
    undefinedFrames,
    maxDiff: Number(maxDiff.toFixed(2)),
    summary: [
      `frames=${frames.length}`,
      `black=${blackFrames.length}`,
      `flat=${flatFrames.length}`,
      `undecoded=${undefinedFrames.length}`,
      `max frame delta=${maxDiff.toFixed(2)}`
    ].join(" | ")
  };
}

/* ------------------------------------------------------------- validation -- */

async function validateClip({ clipPath, label }) {
  const problems = [];
  if (!existsSync(clipPath)) {
    return { ok: false, problems: [`${label}: file missing`] };
  }
  const clipProbe = await probe(clipPath);
  if (!clipProbe.exists || clipProbe.bytes <= 0) problems.push(`${label}: empty file`);
  if (!clipProbe.hasVideo) problems.push(`${label}: no video stream`);
  if (!clipProbe.decodable) problems.push(`${label}: undecodable codec (${clipProbe.videoCodec})`);
  if (!clipProbe.duration || clipProbe.duration < 2) problems.push(`${label}: duration too short (${clipProbe.duration}s)`);
  if (!clipProbe.width || !clipProbe.height) problems.push(`${label}: unknown resolution`);
  return { ok: problems.length === 0, problems, probe: clipProbe };
}

/* ---------------------------------------------------------------- commands -- */

async function commandCheck(options) {
  log.banner("FULLPOS RUNPOD VIDEO LAB - ENVIRONMENT CHECK");
  const git = await gitSnapshot();
  const { ffmpeg, ffprobe } = tooling();

  log.section("Repository (read-only)");
  log.keyValue("root", repoRoot);
  log.keyValue("branch", git.branch ?? "n/a");
  log.keyValue("HEAD", git.head ? git.head.slice(0, 12) : "n/a");
  log.keyValue("uncommitted files", git.dirtyFiles ?? "n/a");
  log.detail("this lab never runs git reset / clean / restore");

  log.section("Local toolchain");
  log.keyValue("node", process.version);
  log.keyValue("ffmpeg", ffmpeg ?? "MISSING");
  log.keyValue("ffprobe", ffprobe ?? "MISSING");
  if (ffmpeg && ffprobe) {
    log.keyValue("ffmpeg version", await ffmpegVersion());
    const filters = await ffmpegFilters();
    const needed = ["drawtext", "xfade", "scale", "pad", "overlay", "fade"];
    const missing = needed.filter((name) => !filters.has(name));
    log.keyValue("required filters", missing.length === 0 ? `all present (${needed.join(", ")})` : `MISSING: ${missing.join(", ")}`);
    log.keyValue("gradients filter", filters.has("gradients") ? "available (intro gradient)" : "not available (solid intro)");
  }

  log.section("Existing RunPod integration (reused, not duplicated)");
  const reachable = await providerModulesReachable();
  log.keyValue("provider modules", reachable.ok ? "imported from apps/api/src/ai-video" : "UNAVAILABLE");
  if (!reachable.ok) log.detail(reachable.reason.split("\n")[0]);
  if (reachable.ok) {
    const profiles = await loadProfiles();
    for (const profile of Object.values(profiles)) {
      log.info(`${profile.id.padEnd(14)} model=${profile.model} endpoint=${endpointId(profile.endpoint)} size=${profile.requestSize} cost~$${profile.estimatedCost}`);
    }
    const credential = await readRunpodCredential();
    log.keyValue("RUNPOD_CREDENTIAL_PRESENT", credential.present ? "YES" : "NO");
    log.detail(`read through the product's own resolver (env -> ${relativeToRepo(credential.envFilePath)})`);
    const r2 = await readR2Presence();
    log.keyValue("R2 configured", r2.configured ? "YES" : "NO");
    log.detail(Object.entries(r2.presence).map(([name, present]) => `${name}=${present ? "YES" : "NO"}`).join("  "));
  }

  log.section("Secret hygiene");
  const hygieneSamples = [
    { label: "RunPod key", value: `RUNPOD_API_KEY=${"rpa_"}FAKEEXAMPLEKEY1234567890`, mustBeMasked: true },
    { label: "presigned URL", value: "https://bucket.example/object?X-Amz-Signature=deadbeef&X-Amz-Credential=EXAMPLE%2F20260921", mustBeMasked: true },
    { label: "secret access key JSON", value: '{"secretAccessKey":"FAKEsecretVALUE123"}', mustBeMasked: true },
    { label: "presence flag", value: "R2_ACCESS_KEY_ID=YES", mustBeMasked: false }
  ];
  let hygieneOk = true;
  for (const sample of hygieneSamples) {
    const output = redact(sample.value);
    const masked = output.includes("<redacted>");
    if (masked !== sample.mustBeMasked) hygieneOk = false;
    log.info(`${sample.label.padEnd(24)} -> ${output.replace("rpa_", "")}`);
  }
  log.keyValue("redaction guard", hygieneOk ? "PASS (values masked, presence flags intact)" : "FAIL");

  log.section("Input");
  const images = validateImages(discoverImageFiles(inputImagesDir));
  log.keyValue("images found", String(images.length));
  log.keyValue("logo", (await resolveLogo(options)) ? "FOUND" : "NOT_FOUND");
  log.keyValue("audio", (await resolveMusic(options)) ? "FOUND" : "NOT_FOUND");
  log.keyValue("accepted formats", SUPPORTED_EXTENSIONS.join(" "));

  log.section("Captions (how each screen will be labelled)");
  const captionOverrides = await loadCaptionOverrides();
  const okImages = images.filter((image) => image.ok).map((image) => image.name);
  const example = okImages.length > 0 ? okImages : ["01-productos.png", "02-facturacion.png", "03-pos-mobile.png", "04-venta-rapida.png", "05-reportes.png"];
  for (const [position, name] of example.entries()) {
    const chosen = captionForImage(name, position, captionOverrides);
    log.info(`${name.padEnd(26)} -> "${chosen.caption}" (${chosen.confidence} via ${chosen.source})`);
  }
  if (okImages.length === 0) log.detail("example names shown - drop your own screenshots into input/images/");
  log.detail("override any caption by adding input/captions.json");

  log.section("Job limits");
  log.keyValue("requested", String(options.maxJobs));
  log.keyValue("hard cap", String(MAX_RUNPOD_JOBS));
  log.keyValue("state file", stateFilePath());

  log.raw("");
  log.raw(reachable.ok ? "CHECK: PASS" : "CHECK: DEGRADED - the tsx loader could not load the provider modules.");
  return reachable.ok ? 0 : 1;
}

async function commandSelftest(options) {
  log.banner("LOCAL PIPELINE SELFTEST (no RunPod, no cost)");
  requireFfmpeg();

  const root = path.join(tempDir, "selftest");
  const imagesDir = path.join(root, "images");
  const clipsOut = path.join(root, "clips");
  const finalOut = path.join(root, "final");
  const framesOut = path.join(root, "frames");
  await mkdir(imagesDir, { recursive: true });
  await mkdir(clipsOut, { recursive: true });
  await mkdir(finalOut, { recursive: true });
  await mkdir(framesOut, { recursive: true });

  log.section("1. Synthetic inputs");
  const synthetic = [];
  // Number 2 is deliberately PORTRAIT: real FullPOS captures mix desktop screens
  // with a phone screen, so the self-test must exercise the blur-fill path.
  const shapes = [
    { size: "1280x720", boxWidth: 1160, boxHeight: 600, label: "SELFTEST-1-LANDSCAPE" },
    { size: "720x1280", boxWidth: 600, boxHeight: 1160, label: "SELFTEST-2-PORTRAIT" }
  ];

  for (const [index, shape] of shapes.entries()) {
    const imagePath = path.join(imagesDir, `0${index + 1}-selftest.png`);
    await runFfmpeg([
      "-f", "lavfi",
      "-i", `color=c=0x123A7C:s=${shape.size}:d=1`,
      "-vf",
      `drawbox=x=60:y=60:w=${shape.boxWidth}:h=${shape.boxHeight}:color=0xF5F9FD@1:t=fill,` +
        `drawbox=x=90:y=90:w=${shape.boxWidth - 60}:h=90:color=0x1957E0@1:t=fill,` +
        `drawtext=fontfile='${escapeFont()}':text=${shape.label}:fontcolor=white:fontsize=40:x=110:y=115`,
      "-frames:v", "1",
      imagePath
    ], "synthetic input");
    synthetic.push(imagePath);
    log.info(`${path.basename(imagePath)} created (${shape.size})`);
  }

  log.section("2. Synthetic clips (zoompan stand-in for a RunPod clip)");
  const clips = [];
  for (const [index, imagePath] of synthetic.entries()) {
    const clipPath = path.join(clipsOut, `clip-0${index + 1}.mp4`);
    const scale = shapes[index].size;
    await runFfmpeg([
      "-loop", "1", "-i", imagePath,
      "-t", "5",
      "-vf", `zoompan=z='min(1+0.0008*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=${scale},fps=30,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      clipPath
    ], "synthetic clip");
    const info = await probe(clipPath);
    log.info(`${path.basename(clipPath)} ${info.width}x${info.height} ${info.duration}s ${formatBytes(info.bytes)}`);
    clips.push({ path: clipPath, probe: info });
  }

  log.section("3. Frame extraction + technical analysis");
  const firstFrames = await extractFramesTo(framesOut, clips[0].path, clips[0].probe.duration, 1);
  const analysis = await analyzeFrameSet(firstFrames.frames);
  log.info(analysis.summary);
  if (analysis.blackFrames.length > 0) log.warn(`black frames: ${analysis.blackFrames.join(", ")}`);
  else log.pass("no black frames");

  log.section("4. Composition (intro + captions + crossfade + outro)");
  const filters = await ffmpegFilters();
  const resolution = masterResolution(clips, { maxWidth: 1920, maxHeight: 1080 });
  await clearSegments();
  const finalPath = path.join(finalOut, "selftest.mp4");
  const composed = await composeFinalVideo({
    clips: clips.map((clip, index) => ({ path: clip.path, caption: `Selftest escena ${index + 1}`, index: index + 1 })),
    logoPath: undefined,
    audioPath: undefined,
    outputPath: finalPath,
    resolution,
    filters
  });
  const finalProbe = await probe(finalPath);
  log.keyValue("output", relativeToLab(finalPath));
  log.keyValue("duration", `${finalProbe.duration}s`);
  log.keyValue("resolution", `${finalProbe.width}x${finalProbe.height}`);
  log.keyValue("size", formatBytes(finalProbe.bytes));

  log.section("5. Final frames + review page");
  const finalFrames = await extractFramesTo(framesOut, finalPath, finalProbe.duration, 7, "final");
  const pagePath = path.join(root, "review-selftest.html");
  await writeFinalReview({
    finalPath,
    finalProbe,
    finalFrames: finalFrames.frames,
    clipEntries: clips.map((clip, index) => ({ label: `clip-0${index + 1}`, path: clip.path, caption: `Selftest ${index + 1}`, detail: `${clip.probe.width}x${clip.probe.height} ${clip.probe.duration}s` })),
    imageEntries: synthetic.map((imagePath, index) => ({ label: `input ${index + 1}`, path: imagePath })),
    analysis,
    aiInspection: "NOT_AVAILABLE",
    outputPath: pagePath
  });
  log.pass(`review page: ${relativeToLab(pagePath)}`);
  const linkCheck = await verifyPageLinks(pagePath);
  if (linkCheck.missing.length === 0) log.pass(`page assets resolved (${linkCheck.resolved}/${linkCheck.total})`);
  else log.fail(`broken page assets: ${linkCheck.missing.join(", ")}`);

  log.raw("");
  log.raw(`SELFTEST: ${analysis.blackFrames.length === 0 && finalProbe.hasVideo && linkCheck.missing.length === 0 ? "PASS" : "FAIL"}`);
  return 0;
}

function escapeFont() {
  const font = existsSync("C:\\Windows\\Fonts\\segoeuib.ttf") ? "C:\\Windows\\Fonts\\segoeuib.ttf" : "C:\\Windows\\Fonts\\arialbd.ttf";
  return font.replace(/\\/g, "/").replace(/:/g, "\\:");
}

async function extractFramesTo(baseDir, videoPath, duration, count, prefix = undefined) {
  const directory = prefix ? path.join(baseDir, prefix) : baseDir;
  await mkdir(directory, { recursive: true });
  const frames = [];
  for (let position = 0; position < count; position += 1) {
    const fraction = count === 1 ? 0 : position / (count - 1);
    const time = fraction >= 1 ? Math.max(0, duration - 0.06) : duration * fraction;
    const label = `${prefix ? `${prefix}-` : "frame-"}${String(position).padStart(2, "0")}`;
    const output = path.join(directory, `${label}.png`);
    await extractFrame({ input: videoPath, timeSeconds: time, output, label });
    frames.push({ label: `${label} | t=${time.toFixed(2)}s`, path: output, time: Number(time.toFixed(3)) });
  }
  return { directory, frames };
}

/* --------------------------------------------------------------- pipeline -- */

async function commandPipeline(options) {
  log.banner("FULLPOS RUNPOD + LOCAL FFMPEG - VIDEO POC");

  await ensureDirectories();
  if (!options.composeOnly) requireFfmpeg();

  const runStartedAt = Date.now();
  const images = validateImages(discoverImageFiles(inputImagesDir));
  log.section("Input discovery");
  log.keyValue("folder", relativeToRepo(inputImagesDir));
  log.keyValue("images found", String(images.length));

  if (images.length === 0) {
    waitingForInputMessage();
    return 0;
  }

  const usable = [];
  for (const image of images) {
    if (!image.ok) {
      log.fail(`${image.name} rejected - ${image.reason}`);
      continue;
    }
    log.info(
      `${image.name} | ${image.mimeType} | ${image.width ?? "?"}x${image.height ?? "?"} | ${formatBytes(image.bytes)}`
    );
    if (image.extensionMismatch) log.detail(`note: ${image.extensionMismatch}`);
    usable.push(image);
  }
  log.keyValue("images usable", String(usable.length));
  if (usable.length === 0) {
    log.raw("");
    log.raw("WAITING FOR VALID INPUT IMAGES - every candidate was rejected as corrupt or unreadable.");
    return 1;
  }

  const state = await loadState();
  const captionOverrides = await loadCaptionOverrides();
  if (options.force) log.warn("--force: completed clips will be regenerated (this spends money again)");

  const selected = usable.slice(0, options.maxJobs);
  const skipped = Math.max(0, usable.length - selected.length);
  log.keyValue("images used", String(selected.length));
  log.keyValue("skipped (job limit)", String(skipped));
  if (skipped > 0) log.detail(`FASE 15 limit: only the first ${options.maxJobs} images are used this run`);

  const logoPath = await resolveLogo(options);
  const musicPath = await resolveMusic(options);
  log.keyValue("logo", logoPath ? relativeToLab(logoPath) : "NOT_FOUND (intro/outro without logo)");
  log.keyValue("audio", musicPath ? relativeToLab(musicPath) : "NOT_FOUND (video rendered without music)");

  const profile = await resolveProfile(options.profile);
  log.section("Provider");
  log.keyValue("profile", profile.id);
  log.keyValue("model", profile.model);
  log.keyValue("endpoint", endpointId(profile.endpoint));
  log.keyValue("requested size", profile.requestSize);
  log.keyValue("clip duration", `${profile.duration}s`);
  log.keyValue("estimated cost", `~$${profile.estimatedCost} per job`);
  log.keyValue("estimated total", `~$${estimateCost(profile, selected.length)} for up to ${selected.length} job(s)`);
  log.detail("estimate comes from the product's own profile table; RunPod reported cost is used when exposed");

  const prompt = promptForModel(profile);
  log.section("Prompt (UI preservation first)");
  log.detail(prompt);
  log.detail(`negative prompt: ${UI_NEGATIVE_PROMPT_SHORT()}`);

  const jobRecords = [];
  const clipCandidates = [];
  const clipBaseDir = options.deterministic ? clipsLocalDir : clipsDir;
  const clipMode = options.deterministic ? "local" : "runpod";

  /* Deterministic mode: animate the REAL screenshots locally. No provider, no
     credential, no cost - and the interface pixels are never redrawn. */
  if (options.deterministic) {
    log.section("Local clips (deterministic motion, no AI, no cost)");
    log.detail("FFmpeg zoompan animates the original screenshot pixels; text stays exact");
    for (const [position, image] of selected.entries()) {
      const index = position + 1;
      const clipPath = path.join(clipBaseDir, `clip-${String(index).padStart(2, "0")}.mp4`);
      const caption = captionForImage(image.name, position, captionOverrides);
      const built = await buildLocalClip({
        imagePath: image.path,
        outputPath: clipPath,
        width: options.localWidth,
        height: options.localHeight,
        seconds: options.localSeconds,
        style: options.motion
      });
      log.info(
        `${image.name} -> ${relativeToLab(clipPath)} (${built.probe.width}x${built.probe.height} ${built.probe.duration}s) | ${built.motion}`
      );
      log.detail(`caption: "${caption.caption}" (${caption.confidence})`);
      clipCandidates.push({ path: clipPath, caption: caption.caption, captionMeta: caption, index, image, probe: built.probe });
    }
  }

  if (!options.composeOnly && !options.deterministic) {
    const credential = await readRunpodCredential();
    if (!credential.present) {
      log.raw("");
      log.raw("WAITING_FOR_RUNPOD_CREDENTIAL");
      log.raw("");
      log.raw("RUNPOD_CREDENTIAL_PRESENT: NO");
      log.raw("");
      log.raw(`Expected variable: RUNPOD_API_KEY`);
      log.raw(`Add it to ${relativeToRepo(credential.envFilePath)} (never commit it, never paste it in chat).`);
      return 2;
    }
    log.section("Credentials");
    log.keyValue("RUNPOD_CREDENTIAL_PRESENT", "YES");
    log.detail("value never printed, never copied, never stored in this lab");
    if (!(await r2Ready())) {
      log.fail("R2 is not configured, so a public image URL cannot be produced for RunPod.");
      return 2;
    }

    let stopAfterFirst = options.firstOnly;
    for (const [position, image] of selected.entries()) {
      const index = position + 1;
      const clipPath = path.join(clipsDir, `clip-${String(index).padStart(2, "0")}.mp4`);
      const caption = captionForImage(image.name, position, captionOverrides);
      log.section(`Scene ${index}/${selected.length} - ${image.name}`);
      log.detail(`caption: "${caption.caption}" (${caption.confidence}, via ${caption.source})`);

      const previous = findRun(state, image.name, profile.id);
      if (!options.force && previous && previous.status === "COMPLETED" && existsSync(clipPath)) {
        const check = await validateClip({ clipPath, label: image.name });
        if (isReusableRun(previous, { clipPath: previous.clipPath, probeOk: check.ok })) {
          log.pass(`SKIP - already completed and valid (${describeRun(previous)})`);
          jobRecords.push({ ...previous, skipped: true });
          clipCandidates.push({ path: clipPath, caption: caption.caption, captionMeta: caption, index, image, probe: check.probe });
          continue;
        }
        log.warn("existing clip did not probe cleanly - regenerating");
      }

      const upload = options.dryRun
        ? {
            objectKey: undefined,
            signedUrl: `https://dry-run.invalid/${encodeURIComponent(image.name)}`,
            expiresAt: undefined,
            bytes: image.bytes,
            sha256: undefined,
            dryRun: true
          }
        : await uploadImageForRunpod({
            localPath: image.path,
            mimeType: image.mimeType,
            runId: new Date().toISOString().replace(/[:.]/g, "-"),
            label: `scene-${String(index).padStart(2, "0")}`
          });

      if (options.dryRun) {
        log.keyValue("public image url", "<not uploaded in dry run>");
        log.detail(`would upload ${image.name} to R2 as poc-runpod-video/<run>/scene-0${index}.png, then presign for ~10 min`);
      } else {
        log.keyValue("public image url", describeSignedUrl(upload.signedUrl));
        log.detail(`object key ${upload.objectKey} | expires ${upload.expiresAt}`);
      }

      const job = await runJob({
        profile,
        apiKey: credential.apiKey,
        imageUrl: upload.signedUrl,
        prompt,
        motion: "elegant",
        timeoutMs: options.timeoutMin * 60 * 1000,
        dryRun: options.dryRun
      });

      const record = {
        image: image.name,
        profile: profile.id,
        model: profile.model,
        caption: caption.caption,
        jobId: job.jobId,
        status: job.status,
        startedAt: new Date().toISOString(),
        elapsedMs: job.elapsedMs,
        attempts: job.attempts,
        polls: job.polls,
        cost: job.cost,
        useReportedCost: job.cost !== undefined,
        objectKey: upload.objectKey,
        imageSha256: upload.sha256,
        clipPath,
        dryRun: Boolean(options.dryRun),
        error: job.error
      };

      if (options.dryRun) {
        log.warn("DRY RUN - no RunPod request was made and nothing was charged");
        log.section("Request that WOULD be sent");
        log.detail(`POST ${job.request?.url}`);
        log.detail(JSON.stringify(maskRequestInput(job.request?.input), null, 2).split("\n").join("\n  "));
        recordRun(state, record);
        await saveState(state);
        continue;
      }

      if (job.failed) {
        log.fail(`job failed - ${job.error ?? job.status}`);
        record.status = "PROVIDER_FAILED";
        record.providerStatus = job.status;
        recordRun(state, record);
        await saveState(state);
        jobRecords.push(record);
        if (!options.keepR2) await cleanupLabObjects([upload.objectKey]);
        if (index === 1) return stopAfterFirstScene(job.jobId);
        log.warn("continuing with the remaining scenes; previous outputs untouched");
        continue;
      }

      const downloaded = await downloadClip({ videoUrl: job.videoUrl, destination: clipPath });
      if (!downloaded.ok) {
        log.fail(`download failed - ${downloaded.error}`);
        record.status = "DOWNLOAD_FAILED";
        record.error = downloaded.error;
        recordRun(state, record);
        await saveState(state);
        jobRecords.push(record);
        if (!options.keepR2) await cleanupLabObjects([upload.objectKey]);
        if (index === 1) return stopAfterFirstScene(job.jobId);
        log.warn("continuing with the remaining scenes; previous outputs untouched");
        continue;
      }

      const check = await validateClip({ clipPath, label: image.name });
      record.status = check.ok ? "COMPLETED" : "INVALID_OUTPUT";
      record.downloadAttempts = downloaded.attempts;
      record.probe = check.probe;
      if (!check.ok) record.error = check.problems.join("; ");
      recordRun(state, record);
      await saveState(state);
      jobRecords.push(record);

      log.keyValue("downloaded", `${relativeToLab(clipPath)} | ${formatBytes(check.probe?.bytes ?? 0)}`);
      if (check.ok) log.pass(`clip valid - ${check.probe.width}x${check.probe.height} ${check.probe.duration}s ${check.probe.videoCodec}`);
      else check.problems.forEach((problem) => log.fail(problem));

      if (index === 1) {
        const testCopy = path.join(clipsDir, "01-test.mp4");
        await copyFile(clipPath, testCopy);
        log.detail(`FASE 10 first-clip copy: ${relativeToLab(testCopy)}`);
      }

      if (!options.keepR2) {
        const cleanup = await cleanupLabObjects([upload.objectKey]);
        if (cleanup.deleted > 0) log.detail(`removed ${cleanup.deleted} temporary R2 object(s)`);
      }

      if (check.ok) clipCandidates.push({ path: clipPath, caption: caption.caption, captionMeta: caption, index, image, probe: check.probe });
      else if (index === 1) return stopAfterFirstScene(job.jobId);

      /* FASE 14 - gate on the very first clip before spending more. */
      if (index === 1) {
        log.section("FASE 14 - first clip quality gate");
        const gate = await evaluateFirstClip({ clipPath, probe: check.probe, index, mode: clipMode });
        if (!gate.ok) {
          log.fail("first clip did not pass the technical gate - STOPPING");
          gate.problems.forEach((problem) => log.fail(problem));
          log.raw("");
          log.raw("FINAL STATUS: POC_NO_GO");
          return 3;
        }
        gate.checks.forEach((check_) => log.pass(check_));
        if (stopAfterFirst) {
          log.raw("");
          log.raw("--first-only requested: stopping after the validated first clip.");
          break;
        }
      }
    }
  } else if (options.composeOnly) {
    log.section("Compose only");
    for (const [position, image] of selected.entries()) {
      const index = position + 1;
      const clipPath = path.join(clipBaseDir, `clip-${String(index).padStart(2, "0")}.mp4`);
      if (!existsSync(clipPath)) {
        log.warn(`missing ${relativeToLab(clipPath)} - skipped`);
        continue;
      }
      const check = await validateClip({ clipPath, label: image.name });
      if (!check.ok) {
        check.problems.forEach((problem) => log.fail(problem));
        continue;
      }
      const caption = captionForImage(image.name, position, captionOverrides);
      log.info(`${image.name} -> ${relativeToLab(clipPath)} (${check.probe.duration}s)`);
      log.detail(`caption: "${caption.caption}" (${caption.confidence})`);
      clipCandidates.push({ path: clipPath, caption: caption.caption, captionMeta: caption, index, image, probe: check.probe });
    }
  }

  if (clipCandidates.length === 0) {
    log.raw("");
    if (options.dryRun) {
      log.raw("DRY RUN COMPLETE - no RunPod job was created and no cost was incurred.");
      log.raw("Re-run without --dry-run to generate the real clips.");
      return 0;
    }
    log.raw("No valid clips are available, so no final video can be composed.");
    log.raw("FINAL STATUS: POC_PARTIAL");
    return 4;
  }

  /* FASE 12/13 - frames + per-clip review */
  log.section("Frames and clip review");
  const clipFrameSets = [];
  for (const clip of clipCandidates) {
    const extracted = await extractClipFrames({
      clipPath: clip.path,
      duration: clip.probe.duration ?? 5,
      index: clip.index,
      mode: clipMode
    });
    const analysis = await analyzeFrameSet(extracted.frames);
    clip.frames = extracted.frames;
    clip.analysis = analysis;
    clipFrameSets.push({ clip, analysis });
    log.info(`clip-${String(clip.index).padStart(2, "0")} | ${analysis.summary}`);
    if (analysis.blackFrames.length > 0) log.warn(`possible black frames: ${analysis.blackFrames.join(", ")}`);
  }

  const firstClip = clipFrameSets[0];
  const clipReview = await writeClipReview({
    imagePath: firstClip.clip.image.path,
    imageMeta: firstClip.clip.image,
    frames: firstClip.clip.frames,
    clipPath: firstClip.clip.path,
    clipProbe: firstClip.clip.probe,
    analysis: firstClip.analysis,
    aiInspection: "NOT_AVAILABLE",
    outputPath: clipReviewPath()
  });
  log.pass(`clip review page: ${relativeToLab(clipReview)}`);
  const clipLinks = await verifyPageLinks(clipReview);
  if (clipLinks.missing.length > 0) log.fail(`broken review assets: ${clipLinks.missing.join(", ")}`);

  /* FASE 18/23 - compose */
  const filters = await ffmpegFilters();
  const resolution = masterResolution(clipCandidates, { maxWidth: 1920, maxHeight: 1080 });
  const portraitClips = clipCandidates.filter((clip) => (clip.probe.width ?? 0) < (clip.probe.height ?? 1));
  log.section("Final composition");
  log.keyValue("master resolution", `${resolution.width}x${resolution.height} (16:9)`);
  log.detail(
    resolution.width < 1920
      ? `master stays at the source resolution (${resolution.width}px wide) instead of upscaling destructively`
      : "full HD master"
  );
  log.keyValue("aspect basis", resolution.basedOn);
  if (portraitClips.length > 0) {
    log.info(`${portraitClips.length} portrait clip(s) will sit on a blurred fill, not on black bars`);
  }

  await clearSegments();
  const finalName = options.deterministic ? "fullpos-local-demo.mp4" : "fullpos-runpod-demo.mp4";
  const finalPath = path.join(finalDir, finalName);
  const composed = await composeFinalVideo({
    clips: clipCandidates.map((clip) => ({ path: clip.path, caption: clip.caption, index: clip.index })),
    logoPath,
    audioPath: musicPath,
    outputPath: finalPath,
    resolution,
    filters
  });

  const finalProbe = await probe(finalPath);
  log.keyValue("output", relativeToLab(finalPath));
  log.keyValue("size", formatBytes(finalProbe.bytes));
  log.keyValue("duration", `${finalProbe.duration}s`);
  log.keyValue("resolution", `${finalProbe.width}x${finalProbe.height}`);
  log.keyValue("codec", `${finalProbe.videoCodec}/${finalProbe.pixelFormat}`);
  log.keyValue("audio stream", finalProbe.hasAudio ? `yes (${finalProbe.audioCodec})` : "no");

  const formatsPlan = buildFormatsPlan({ masterPath: relativeToLab(finalPath), masterWidth: finalProbe.width, masterHeight: finalProbe.height });
  await writeFile(path.join(outputRoot, "formats-plan.json"), `${JSON.stringify(formatsPlan, null, 2)}\n`, "utf8");
  log.detail(`16:9 master generated; 9:16 and 1:1 prepared in ${relativeToLab(path.join(outputRoot, "formats-plan.json"))}`);

  const renderedFormats = [];
  for (const spec of formatsPlan.derived) {
    if (!options.formats.includes(spec.aspect)) continue;
    const outputPath = path.join(finalDir, `${finalName.replace(/\.mp4$/, "")}-${spec.aspect.replace(":", "x")}.mp4`);
    await renderDerived({ masterPath: finalPath, spec, outputPath });
    spec.status = "generated";
    spec.path = relativeToLab(outputPath);
    renderedFormats.push(spec);
    log.pass(`derived ${spec.aspect}: ${relativeToLab(outputPath)}`);
  }

  /* FASE 25/26 - final frames + review */
  log.section("Final validation");
  const finalFrames = await extractFinalFrames({
    videoPath: finalPath,
    duration: finalProbe.duration ?? composed.duration,
    count: 7,
    mode: clipMode
  });
  const finalAnalysis = await analyzeFrameSet(finalFrames.frames);
  log.info(finalAnalysis.summary);
  if (finalAnalysis.blackFrames.length === 0) log.pass("no black frames in the final video");
  else log.fail(`black frames detected: ${finalAnalysis.blackFrames.join(", ")}`);

  const finalReview = await writeFinalReview({
    finalPath,
    finalProbe,
    finalFrames: finalFrames.frames,
    clipEntries: clipCandidates.map((clip) => ({
      label: `clip-${String(clip.index).padStart(2, "0")}`,
      path: clip.path,
      caption: clip.caption,
      detail: `${clip.probe.width}x${clip.probe.height} | ${clip.probe.duration}s | ${formatBytes(clip.probe.bytes)}`
    })),
    imageEntries: clipCandidates.map((clip) => ({ label: clip.image.name, path: clip.image.path })),
    analysis: finalAnalysis,
    aiInspection: "NOT_AVAILABLE",
    outputPath: finalReviewPath()
  });
  log.pass(`final review page: ${relativeToLab(finalReview)}`);
  const finalLinks = await verifyPageLinks(finalReview);
  if (finalLinks.missing.length === 0) log.pass(`page assets resolved (${finalLinks.resolved}/${finalLinks.total})`);
  else log.fail(`broken review assets: ${finalLinks.missing.join(", ")}`);

  if (options.open) {
    await openInBrowser(finalReview).catch(() => log.warn("could not open the review page automatically"));
  }

  /* FASE 27 - metrics */
  const totalElapsedMs = Date.now() - runStartedAt;
  const reportedCosts = jobRecords.filter((record) => typeof record.cost === "number");
  log.section("Job metrics");
  if (jobRecords.length === 0) {
    log.info("no jobs ran in this invocation (compose-only or everything was skipped)");
  } else {
    for (const record of jobRecords) {
      log.info(
        [
          record.image,
          record.profile,
          `job=${record.jobId ?? "n/a"}`,
          record.elapsedMs ? `${(record.elapsedMs / 1000).toFixed(1)}s` : "n/a",
          record.probe ? formatBytes(record.probe.bytes) : "n/a",
          record.probe?.duration ? `${record.probe.duration}s` : "n/a",
          record.status + (record.skipped ? " (skipped)" : "")
        ].join(" | ")
      );
    }
  }
  log.keyValue("jobs executed this run", String(jobRecords.filter((record) => !record.skipped).length));
  log.keyValue("total time", `${(totalElapsedMs / 1000).toFixed(1)}s`);
  log.keyValue(
    "provider-reported cost",
    reportedCosts.length > 0 ? `$${reportedCosts.reduce((sum, record) => sum + record.cost, 0).toFixed(4)}` : "not exposed by RunPod - not estimated here"
  );

  const report = {
    generatedAt: new Date().toISOString(),
    profile: profile.id,
    model: profile.model,
    endpoint: endpointId(profile.endpoint),
    imagesFound: images.length,
    imagesUsed: selected.length,
    imagesSkippedDueToJobLimit: skipped,
    jobs: jobRecords.map((record) => ({
      image: record.image,
      profile: record.profile,
      jobId: record.jobId,
      status: record.status,
      elapsedMs: record.elapsedMs,
      cost: record.cost,
      outputBytes: record.probe?.bytes,
      duration: record.probe?.duration
    })),
    clips: clipCandidates.map((clip) => ({
      index: clip.index,
      path: relativeToLab(clip.path),
      caption: clip.caption,
      probe: { width: clip.probe.width, height: clip.probe.height, duration: clip.probe.duration, codec: clip.probe.videoCodec, bytes: clip.probe.bytes }
    })),
    final: {
      path: relativeToLab(finalPath),
      bytes: finalProbe.bytes,
      duration: finalProbe.duration,
      resolution: `${finalProbe.width}x${finalProbe.height}`,
      codec: finalProbe.videoCodec,
      audio: finalProbe.hasAudio,
      derived: renderedFormats.map((spec) => ({ aspect: spec.aspect, path: spec.path }))
    },
    frames: {
      clipSets: clipFrameSets.length,
      final: finalFrames.frames.length,
      blackFrames: finalAnalysis.blackFrames.length,
      flatFrames: finalAnalysis.flatFrames.length
    },
    manualReview: {
      clip: relativeToLab(clipReview),
      final: relativeToLab(finalReview)
    }
  };
  const reportPath = path.join(outputRoot, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  log.raw("");
  log.raw(`COMPOSED: YES - ${relativeToLab(finalPath)}`);
  log.raw(`REPORT:   ${relativeToLab(reportPath)}`);
  log.raw("MANUAL_VISUAL_REVIEW_REQUIRED");
  log.raw("");
  return 0;
}

function UI_NEGATIVE_PROMPT_SHORT() {
  return "distorted UI, warped text, invented buttons, flickering, heavy motion, people, hands";
}

/** Never let a signed URL reach a log or a state file through the payload dump. */
function maskRequestInput(input) {
  if (!input || typeof input !== "object") return input;
  const clone = { ...input };
  if (typeof clone.image === "string") clone.image = "<signed-public-url>";
  return clone;
}

/**
 * FASE 14/15 - the first scene decides whether more money is spent. On ANY
 * first-scene failure the run stops here instead of paying for the rest, and the
 * job id is kept so a completed-but-unreadable job can still be recovered.
 */
function stopAfterFirstScene(jobId) {
  log.raw("");
  log.raw("First scene failed - stopping BEFORE spending on the remaining scenes.");
  if (jobId) log.raw(`Job id kept for recovery: ${jobId}`);
  log.raw("A completed job can still be downloaded for free: --recover --jobs \"<image>=<jobId>\"");
  log.raw("");
  log.raw("FINAL STATUS: POC_NO_GO");
  return 3;
}

/** FASE 14 - technical gate applied to the first generated clip. */
async function evaluateFirstClip({ clipPath, probe: clipProbe, index, mode = "runpod" }) {
  const checks = [];
  const problems = [];

  if (clipProbe.hasVideo) checks.push("JOB COMPLETED + MP4 VALID (video stream present)");
  else problems.push("no video stream");

  if (clipProbe.duration >= 3) checks.push(`DURATION VALID (${clipProbe.duration}s)`);
  else problems.push(`duration below 3s (${clipProbe.duration}s)`);

  if (clipProbe.decodable) checks.push(`PLAYBACK PASS (${clipProbe.videoCodec}/${clipProbe.pixelFormat} decodable)`);
  else problems.push(`codec not decodable (${clipProbe.videoCodec})`);

  const extracted = await extractClipFrames({ clipPath, duration: clipProbe.duration ?? 5, index, mode });
  const analysis = await analyzeFrameSet(extracted.frames);
  if (analysis.undefinedFrames.length === 0) checks.push("FRAME EXTRACTION PASS");
  else problems.push(`frames could not be decoded: ${analysis.undefinedFrames.join(", ")}`);

  if (analysis.blackFrames.length === 0) checks.push("NO BLACK OUTPUT");
  else problems.push(`black frames: ${analysis.blackFrames.join(", ")}`);

  return { ok: problems.length === 0, checks, problems, analysis };
}

/** `01-facturacion.png=<jobId>,02-venta-rapida.png=<jobId>` */
function parseJobPairs(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [image, jobId] = chunk.split("=").map((value) => value.trim());
      return image && jobId ? { image, jobId } : undefined;
    })
    .filter(Boolean);
}

/**
 * Recovers clips for jobs that already ran (and were already paid for) but whose
 * files are missing. Reading a job's status costs nothing, so this is free.
 */
async function commandRecover(options) {
  log.banner("RECOVER PAID RUNPOD JOBS");
  await ensureDirectories();
  requireFfmpeg();

  const pairs = parseJobPairs(options.jobs);
  if (pairs.length === 0) {
    log.warn('nothing to recover - pass: --jobs "<image>=<jobId>,<image>=<jobId>"');
    return 0;
  }

  const images = validateImages(discoverImageFiles(inputImagesDir)).filter((image) => image.ok);
  const profile = await resolveProfile(options.profile);
  const credential = await readRunpodCredential();
  if (!credential.present) {
    log.raw("");
    log.raw("WAITING_FOR_RUNPOD_CREDENTIAL");
    return 2;
  }

  const state = await loadState();
  const results = [];

  for (const pair of pairs) {
    const position = images.findIndex((image) => image.name === pair.image);
    if (position < 0) {
      log.fail(`${pair.image} is not in input/images/ - skipped`);
      continue;
    }
    const index = position + 1;
    const clipPath = path.join(clipsDir, `clip-${String(index).padStart(2, "0")}.mp4`);

    log.section(`${pair.image} (scene ${index})`);
    log.keyValue("job id", pair.jobId);

    const existing = await validateClip({ clipPath, label: pair.image }).catch(() => ({ ok: false }));
    if (existing.ok && !options.force) {
      log.pass("clip already on disk - skipped");
      continue;
    }

    let payload;
    try {
      payload = await fetchJobStatus({ profile, apiKey: credential.apiKey, jobId: pair.jobId });
    } catch (error) {
      log.fail(`could not read the job status: ${error.message}`);
      continue;
    }
    log.keyValue("provider status", payload?.status ?? "unknown");
    if (payload?.status !== "COMPLETED" && payload?.status !== "COMPLETED_WITH_ERRORS") {
      log.warn(`job is ${payload?.status} - nothing to download`);
      continue;
    }

    const parsed = await parseProviderResult(payload, profile);
    log.keyValue("url found under", parsed.urlSource ?? "NOT FOUND");
    log.keyValue("reported cost", parsed.cost !== undefined ? `$${parsed.cost}` : "not exposed");
    if (!parsed.videoUrl) {
      log.fail("the provider output contains no recognisable video URL");
      continue;
    }

    const downloaded = await downloadClip({ videoUrl: parsed.videoUrl, destination: clipPath });
    if (!downloaded.ok) {
      log.fail(`download failed - ${downloaded.error}`);
      continue;
    }

    const check = await validateClip({ clipPath, label: pair.image });
    const caption = captionForImage(pair.image, position);
    recordRun(state, {
      image: pair.image,
      profile: profile.id,
      model: profile.model,
      caption: caption.caption,
      jobId: pair.jobId,
      status: check.ok ? "COMPLETED" : "INVALID_OUTPUT",
      recoveredAt: new Date().toISOString(),
      cost: parsed.cost,
      clipPath,
      probe: check.probe,
      error: check.ok ? undefined : check.problems.join("; ")
    });
    await saveState(state);

    if (check.ok) {
      results.push({ image: pair.image, cost: parsed.cost, probe: check.probe });
      log.pass(
        `recovered -> ${relativeToLab(clipPath)} (${check.probe.width}x${check.probe.height} ${check.probe.duration}s ${formatBytes(check.probe.bytes)})`
      );
    } else {
      check.problems.forEach((problem) => log.fail(problem));
    }
  }

  log.section("Recovery summary");
  log.keyValue("clips recovered", `${results.length}/${pairs.length}`);
  log.keyValue("new cost", "$0 (only job status was read)");
  const costs = results.filter((result) => typeof result.cost === "number");
  if (costs.length > 0) {
    log.keyValue("already-paid cost", `$${costs.reduce((sum, result) => sum + result.cost, 0).toFixed(2)}`);
  }
  if (results.length > 0) log.detail("run --compose-only to assemble the final video from the recovered clips");
  return results.length > 0 ? 0 : 4;
}

/**
 * A/B comparison between the two ways of animating the same screenshots.
 *
 * The headline number is measured at FRAME 0: no camera movement has happened
 * yet, so any pixel difference between the two renders is content the generator
 * changed rather than framing.
 */
async function commandCompare(options) {
  log.banner("A/B - RUNPOD IMAGE-TO-VIDEO vs DETERMINISTIC FFMPEG MOTION");
  requireFfmpeg();

  const images = validateImages(discoverImageFiles(inputImagesDir))
    .filter((image) => image.ok)
    .slice(0, options.maxJobs);
  if (images.length === 0) {
    waitingForInputMessage();
    return 0;
  }

  const scenes = [];
  for (const [position, image] of images.entries()) {
    const index = position + 1;
    const nn = String(index).padStart(2, "0");
    const runpodClip = path.join(clipsDir, `clip-${nn}.mp4`);
    const localClip = path.join(clipsLocalDir, `clip-${nn}.mp4`);
    const runpodFrame0 = path.join(framesDir, "runpod", nn, "frame-000.png");
    const localFrame0 = path.join(framesDir, "local", nn, "frame-000.png");
    const runpodFrame = path.join(framesDir, "runpod", nn, "frame-100.png");
    const localFrame = path.join(framesDir, "local", nn, "frame-100.png");

    let pixelDifference;
    if (existsSync(runpodFrame0) && existsSync(localFrame0)) {
      const diff = await diffRatio(runpodFrame0, localFrame0);
      if (diff.ok) pixelDifference = `${diff.percent.toFixed(2)}%`;
    }

    scenes.push({
      label: `${nn} - ${image.name}`,
      original: image.path,
      runpodClip: existsSync(runpodClip) ? runpodClip : undefined,
      localClip: existsSync(localClip) ? localClip : undefined,
      runpodFrame0: existsSync(runpodFrame0) ? runpodFrame0 : undefined,
      localFrame0: existsSync(localFrame0) ? localFrame0 : undefined,
      runpodFrame: existsSync(runpodFrame) ? runpodFrame : undefined,
      localFrame: existsSync(localFrame) ? localFrame : undefined,
      pixelDifference
    });
    log.info(`${nn} ${image.name} | frame-0 pixel difference: ${pixelDifference ?? "not measurable"}`);
  }

  const finals = [];
  const runpodFinal = path.join(finalDir, "fullpos-runpod-demo.mp4");
  const localFinal = path.join(finalDir, "fullpos-local-demo.mp4");
  for (const [label, file] of [
    ["RunPod image-to-video", runpodFinal],
    ["Deterministic FFmpeg motion", localFinal]
  ]) {
    if (!existsSync(file)) continue;
    const info = await probe(file);
    finals.push({ label, path: file, detail: `${info.duration}s | ${info.width}x${info.height}` });
  }

  const pagePath = path.join(outputRoot, "compare.html");
  await writeComparisonPage({
    scenes,
    finals,
    outputPath: pagePath,
    note: "Read the first-frame pair of each scene: the deterministic version is the captured screenshot zoomed, so every word, number and badge matches the original. Check the model version for renamed branding, altered amounts, changed dates and invented labels."
  });
  log.pass(`comparison page: ${relativeToLab(pagePath)}`);

  const linkCheck = await verifyPageLinks(pagePath);
  if (linkCheck.missing.length === 0) log.pass(`page assets resolved (${linkCheck.resolved}/${linkCheck.total})`);
  else log.fail(`broken page assets: ${linkCheck.missing.join(", ")}`);

  if (options.open) await openInBrowser(pagePath).catch(() => log.warn("could not open the comparison page"));
  return 0;
}

async function commandReview(options) {
  log.banner("REVIEW PAGES");
  const state = await loadState();
  const clips = state.runs.filter((run) => run.status === "COMPLETED" && run.clipPath && existsSync(run.clipPath));
  if (clips.length === 0) {
    log.warn("no completed clips on disk yet - nothing to review");
    waitingForInputMessage();
    return 0;
  }
  log.info(`${clips.length} completed clip(s) recorded in ${stateFilePath()}`);
  const finalPath = path.join(finalDir, "fullpos-runpod-demo.mp4");
  if (!existsSync(finalPath)) {
    log.warn("final video not composed yet - run the pipeline (or --compose-only) first");
    return 0;
  }
  const finalProbe = await probe(finalPath);
  await openInBrowser(finalReviewPath());
  log.pass(relativeToLab(finalReviewPath()));
  log.detail(`${finalProbe.duration}s | ${finalProbe.width}x${finalProbe.height}`);
  return 0;
}

async function openInBrowser(target) {
  const { spawn } = await import("node:child_process");
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

/* -------------------------------------------------------------------- main -- */

async function main() {
  await ensureTypeScriptLoader();
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return 0;
  }
  if (!Number.isFinite(options.maxJobs) || options.maxJobs < 1) {
    throw new Error("--max-jobs must be a positive number");
  }
  if (options.maxJobs > MAX_RUNPOD_JOBS) {
    log.warn(`--max-jobs ${options.maxJobs} exceeds the POC limit; using ${MAX_RUNPOD_JOBS}`);
    options.maxJobs = MAX_RUNPOD_JOBS;
  }

  switch (options.command) {
    case "check":
      return commandCheck(options);
    case "selftest":
      return commandSelftest(options);
    case "review":
      return commandReview(options);
    case "recover":
      return commandRecover(options);
    case "compare":
      return commandCompare(options);
    default:
      return commandPipeline(options);
  }
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    log.raw("");
    log.error(redact(error?.message ?? String(error)));
    if (process.env.FULLPOS_LAB_DEBUG === "1" && error?.stack) {
      log.detail(redact(error.stack));
    }
    process.exitCode = 1;
  });
