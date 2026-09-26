/**
 * Deterministic clip generation - the alternative to image-to-video.
 *
 * A real screenshot is animated with FFmpeg's `zoompan`: the camera pushes in
 * gently over the ORIGINAL pixels. Nothing is generated, re-drawn or re-encoded
 * by a model, so every word, number, icon and badge stays exactly as captured.
 *
 * This is the approach AGENTS.md mandates for software UI: "never use generative
 * AI as the authoritative renderer of software UI ... use deterministic Remotion
 * zoom, pan, crop, highlight..."
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { even, probe, runFfmpeg } from "./ffmpeg.mjs";

export const DEFAULT_LOCAL_SECONDS = 5;

/** Motion presets. Kept deliberately restrained for UI legibility. */
export const MOTION_STYLES = {
  /** Slow centred push-in - safest for text-heavy screens. */
  "push-in": {
    label: "Gentle push-in",
    zoom: (frames) => `min(1+${(0.045 / Math.max(1, frames - 1)).toFixed(6)}*on,1.045)`,
    x: "iw/2-(iw/zoom/2)",
    y: "ih/2-(ih/zoom/2)"
  },
  /** Push-in that drifts slightly upward - a touch more life, still no crop loss. */
  "push-in-up": {
    label: "Push-in with slight upward drift",
    zoom: (frames) => `min(1+${(0.05 / Math.max(1, frames - 1)).toFixed(6)}*on,1.05)`,
    x: "iw/2-(iw/zoom/2)",
    y: `max(0,ih/2-(ih/zoom/2)-${(0.012).toFixed(4)}*on)`
  }
};

/**
 * Renders one still screenshot into a video clip with deterministic motion.
 * The frame rate, duration, codec and resolution match the RunPod clips so the
 * two can be compared and mixed directly.
 */
export async function buildLocalClip({
  imagePath,
  outputPath,
  width = 1280,
  height = 720,
  seconds = DEFAULT_LOCAL_SECONDS,
  fps = 30,
  style = "push-in",
  padColor = "0x0B1B33"
}) {
  const motion = MOTION_STYLES[style] ?? MOTION_STYLES["push-in"];
  const frames = Math.max(1, Math.round(seconds * fps));
  const targetWidth = even(width);
  const targetHeight = even(height);

  // Fit the still into the master frame first (never non-uniformly), then push in.
  const chain = [
    `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
    `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`,
    `zoompan=z='${motion.zoom(frames)}':x='${motion.x}':y='${motion.y}':d=${frames}:s=${targetWidth}x${targetHeight}:fps=${fps}`,
    "setsar=1",
    `fps=${fps}`,
    "format=yuv420p"
  ];

  await mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(
    [
      "-loop", "1",
      "-i", imagePath,
      "-t", String(seconds),
      "-vf", chain.join(","),
      "-an",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      outputPath
    ],
    { label: `local clip (${motion.label})` }
  );

  const info = await probe(outputPath);
  return { path: outputPath, probe: info, style, motion: motion.label };
}
