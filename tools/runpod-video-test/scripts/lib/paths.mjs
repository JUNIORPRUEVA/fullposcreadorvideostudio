import path from "node:path";

/** `tools/runpod-video-test` */
export const labRoot = path.resolve(import.meta.dirname, "..", "..");
/** Repository root (`FullPOS-Ad-Studio`) */
export const repoRoot = path.resolve(labRoot, "..", "..");

export const inputRoot = path.join(labRoot, "input");
export const inputImagesDir = path.join(inputRoot, "images");
export const inputLogoDir = path.join(inputRoot, "logo");
export const inputAudioDir = path.join(inputRoot, "audio");

export const outputRoot = path.join(labRoot, "output");
export const clipsDir = path.join(outputRoot, "clips");
export const clipsLocalDir = path.join(outputRoot, "clips-local");
export const framesDir = path.join(outputRoot, "frames");
export const finalDir = path.join(outputRoot, "final");

export const tempDir = path.join(labRoot, "temp");
export const statePath = path.join(tempDir, "jobs.json");

export const inputImagesRel = "input/images";
export const inputLogoRel = "input/logo";
export const inputAudioRel = "input/audio";

/** Path relative to the repository root, using forward slashes. */
export function relativeToRepo(target) {
  return path.relative(repoRoot, target).split(path.sep).join("/");
}

/** Path relative to the lab root, using forward slashes (safe for ffmpeg filters). */
export function relativeToLab(target) {
  return path.relative(labRoot, target).split(path.sep).join("/");
}
