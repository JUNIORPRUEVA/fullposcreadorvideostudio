/**
 * FASE 11-13 / FASE 24-25 - local FFmpeg discovery, probing and frame analysis.
 *
 * Nothing is ever installed silently: binaries are looked up on PATH and in the
 * usual Windows install locations, and the lab reports what it found.
 */
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { labRoot } from "./paths.mjs";

const execFileAsync = promisify(execFile);

const FALLBACK_DIRS = [
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links") : undefined,
  "C:\\ffmpeg\\bin",
  "C:\\Program Files\\ffmpeg\\bin",
  "C:\\ProgramData\\chocolatey\\bin",
  "/usr/bin",
  "/usr/local/bin"
].filter(Boolean);

/** Finds an executable on PATH, then in known install directories. */
export function findBinary(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const searchDirs = [...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean), ...FALLBACK_DIRS];
  for (const dir of searchDirs) {
    const candidate = path.join(dir, executable);
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

let cachedTooling;

export function tooling() {
  if (cachedTooling) return cachedTooling;
  cachedTooling = {
    ffmpeg: findBinary("ffmpeg"),
    ffprobe: findBinary("ffprobe")
  };
  return cachedTooling;
}

export function requireFfmpeg() {
  const { ffmpeg, ffprobe } = tooling();
  if (!ffmpeg || !ffprobe) {
    throw new Error(
      [
        "FFmpeg/FFprobe were not found on this machine.",
        `  ffmpeg : ${ffmpeg ?? "MISSING"}`,
        `  ffprobe: ${ffprobe ?? "MISSING"}`,
        "Install FFmpeg (e.g. `winget install Gyan.FFmpeg`) or add its bin folder to PATH, then re-run.",
        "The lab never installs software by itself."
      ].join("\n")
    );
  }
  return { ffmpeg, ffprobe };
}

export async function ffmpegVersion() {
  const { ffmpeg } = requireFfmpeg();
  const { stdout } = await execFileAsync(ffmpeg, ["-hide_banner", "-version"], { maxBuffer: 4 * 1024 * 1024 });
  return stdout.split(/\r?\n/)[0];
}

/** Filter availability decides which composition effects are safe to use. */
export async function ffmpegFilters() {
  const { ffmpeg } = requireFfmpeg();
  const { stdout } = await execFileAsync(ffmpeg, ["-hide_banner", "-filters"], { maxBuffer: 16 * 1024 * 1024 });
  const available = new Set();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*[TSC.]{1,3}\s+(\S+)\s/);
    if (match) available.add(match[1]);
  }
  return available;
}

export async function runFfmpeg(args, { label = "ffmpeg", cwd = labRoot } = {}) {
  const { ffmpeg } = requireFfmpeg();
  try {
    const { stderr } = await execFileAsync(ffmpeg, ["-hide_banner", "-nostdin", "-y", ...args], {
      cwd,
      maxBuffer: 64 * 1024 * 1024
    });
    return { stderr };
  } catch (error) {
    const tail = String(error.stderr ?? error.message)
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-8)
      .join("\n");
    throw new Error(`${label} failed:\n${tail}`);
  }
}

export async function runFfprobe(args, { cwd = labRoot } = {}) {
  const { ffprobe } = requireFfmpeg();
  const { stdout } = await execFileAsync(ffprobe, ["-hide_banner", ...args], { cwd, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** Raw ffprobe JSON for a media file. */
export async function probeRaw(filePath) {
  const stdout = await runFfprobe([
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);
  return JSON.parse(stdout);
}

const VIDEO_CODECS = new Set(["h264", "hevc", "h265", "vp8", "vp9", "av1", "mpeg4", "prores"]);

/** Normalised, human-facing summary of a media file. */
export function summarizeProbe(json, filePath) {
  const streams = Array.isArray(json?.streams) ? json.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(json?.format?.duration ?? video?.duration);
  const fps = parseFps(video?.avg_frame_rate ?? video?.r_frame_rate);

  return {
    path: filePath,
    exists: existsSync(filePath),
    bytes: existsSync(filePath) ? statSync(filePath).size : 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    videoCodec: video?.codec_name,
    pixelFormat: video?.pix_fmt,
    audioCodec: audio?.codec_name,
    width: video?.width,
    height: video?.height,
    fps,
    duration: Number.isFinite(duration) ? Number(duration.toFixed(3)) : undefined,
    frameCount: video?.nb_frames ? Number(video.nb_frames) : undefined,
    format: json?.format?.format_name,
    bitrate: json?.format?.bit_rate ? Number(json.format.bit_rate) : undefined,
    decodable: Boolean(video) && VIDEO_CODECS.has(String(video?.codec_name))
  };
}

export async function probe(filePath) {
  return summarizeProbe(await probeRaw(filePath), filePath);
}

function parseFps(value) {
  if (!value || typeof value !== "string") return undefined;
  const [num, den] = value.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
  return Number((num / den).toFixed(3));
}

/** FASE 12 - extracts one still frame at an absolute timestamp. */
export async function extractFrame({ input, timeSeconds, output, label }) {
  await mkdir(path.dirname(output), { recursive: true });
  await runFfmpeg(
    ["-ss", String(Math.max(0, timeSeconds)), "-i", input, "-frames:v", "1", "-q:v", "2", output],
    { label: label ?? "frame extraction" }
  );
  return output;
}

/**
 * Decodes a still frame to grayscale in-memory and reports simple statistics.
 * This is a DETERMINISTIC technical check (black/flat/broken frames), not a
 * substitute for looking at the picture.
 */
export async function analyzeFrame(filePath) {
  const { ffmpeg } = requireFfmpeg();
  const width = 64;
  const height = 36;
  const { stdout } = await execFileAsync(
    ffmpeg,
    ["-hide_banner", "-nostdin", "-v", "error", "-i", filePath, "-vf", `scale=${width}:${height}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 }
  );
  const pixels = stdout;
  if (!pixels || pixels.length === 0) {
    return { ok: false, reason: "frame could not be decoded" };
  }

  let sum = 0;
  let min = 255;
  let max = 0;
  let dark = 0;
  for (const value of pixels) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
    if (value < 16) dark += 1;
  }
  const mean = sum / pixels.length;
  let variance = 0;
  for (const value of pixels) variance += (value - mean) ** 2;
  const stddev = Math.sqrt(variance / pixels.length);

  return {
    ok: true,
    mean: Number(mean.toFixed(2)),
    min,
    max,
    stddev: Number(stddev.toFixed(2)),
    darkRatio: Number((dark / pixels.length).toFixed(3)),
    black: mean < 12 && max < 40,
    flat: stddev < 4
  };
}

async function grayPixels(filePath, width = 64, height = 36) {
  const { ffmpeg } = requireFfmpeg();
  const { stdout } = await execFileAsync(
    ffmpeg,
    ["-hide_banner", "-nostdin", "-v", "error", "-i", filePath, "-vf", `scale=${width}:${height}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 }
  );
  return stdout;
}

/**
 * Fraction of pixels that differ between two stills by more than `threshold`.
 * Unlike a mean difference, this keeps small but real changes visible - rewriting
 * a word changes many pixels sharply, even when the picture looks similar overall.
 */
export async function diffRatio(firstPath, secondPath, { width = 640, height = 360, threshold = 24 } = {}) {
  const [a, b] = await Promise.all([grayPixels(firstPath, width, height), grayPixels(secondPath, width, height)]);
  if (!a?.length || !b?.length || a.length !== b.length) return { ok: false, reason: "frames not comparable" };
  let changed = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (Math.abs(a[index] - b[index]) > threshold) changed += 1;
  }
  return {
    ok: true,
    changed,
    total: a.length,
    ratio: changed / a.length,
    percent: Number(((changed / a.length) * 100).toFixed(2))
  };
}

/**
 * Mean absolute pixel difference between two stills (0 = identical).
 * NOTE: on a downscaled grayscale grid this is a "how different does it look"
 * measure. It is deliberately NOT used to judge text rewriting, because small
 * text changes average away; use `diffRatio` for that.
 */
export async function compareFrames(firstPath, secondPath, { width = 64, height = 36 } = {}) {
  const [a, b] = await Promise.all([grayPixels(firstPath, width, height), grayPixels(secondPath, width, height)]);
  if (!a?.length || !b?.length || a.length !== b.length) return { ok: false, reason: "frames not comparable" };
  let total = 0;
  let worst = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = Math.abs(a[index] - b[index]);
    total += delta;
    if (delta > worst) worst = delta;
  }
  return { ok: true, meanAbsDiff: Number((total / a.length).toFixed(2)), worstAbsDiff: worst };
}

export async function removeFile(filePath) {
  await rm(filePath, { force: true });
}

/** Width/height rounded down to even numbers (H.264 requirement). */
export function even(value) {
  return Math.max(2, Math.floor(value / 2) * 2);
}
