import type { CustomSubtitleCue, FocusKeyframe, VideoScene } from "./index.js";

export function validateTrimRange(input: { trimStartSeconds?: number; trimEndSeconds?: number; mediaDurationSeconds?: number }) {
  const start = input.trimStartSeconds ?? 0;
  const end = input.trimEndSeconds;
  if (start < 0) return { ok: false, reason: "trimStartSeconds must be greater than or equal to 0." };
  if (end !== undefined && end <= start) return { ok: false, reason: "trimEndSeconds must be greater than trimStartSeconds." };
  if (end !== undefined && input.mediaDurationSeconds !== undefined && end > input.mediaDurationSeconds) return { ok: false, reason: "trimEndSeconds exceeds source duration." };
  return { ok: true, selectedDurationSeconds: end === undefined ? undefined : end - start };
}

export function timelineDurationSeconds(scenes: Array<Pick<VideoScene, "duration">>) {
  return scenes.reduce((sum, scene) => sum + scene.duration, 0);
}

export function interpolateFocusKeyframes(keyframes: FocusKeyframe[], timeSeconds: number) {
  const sorted = keyframes
    .map((keyframe) => ({ ...keyframe, timeSeconds: keyframe.timeSeconds ?? keyframe.time ?? 0 }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (!sorted.length) return { x: 0.5, y: 0.5, scale: 1 };
  if (timeSeconds <= sorted[0].timeSeconds) return pickFocus(sorted[0]);
  if (timeSeconds >= sorted[sorted.length - 1].timeSeconds) return pickFocus(sorted[sorted.length - 1]);
  const nextIndex = sorted.findIndex((keyframe) => keyframe.timeSeconds >= timeSeconds);
  const previous = sorted[nextIndex - 1];
  const next = sorted[nextIndex];
  const progress = smooth((timeSeconds - previous.timeSeconds) / (next.timeSeconds - previous.timeSeconds));
  return {
    x: lerp(previous.x, next.x, progress),
    y: lerp(previous.y, next.y, progress),
    scale: lerp(previous.scale, next.scale, progress)
  };
}

export function calloutVisible(callout: { at?: number; startTime?: number; endTime?: number }, timeSeconds: number) {
  const start = callout.startTime ?? callout.at ?? 0;
  const end = callout.endTime ?? start + 3;
  return timeSeconds >= start && timeSeconds <= end;
}

export function automaticSubtitleCues(text: string, durationSeconds: number, wordsPerCue = 8): CustomSubtitleCue[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += wordsPerCue) {
    chunks.push(words.slice(index, index + wordsPerCue).join(" "));
  }
  return chunks.map((chunk, index) => ({
    start: (durationSeconds / chunks.length) * index,
    end: (durationSeconds / chunks.length) * (index + 1),
    text: chunk
  }));
}

function pickFocus(keyframe: FocusKeyframe & { timeSeconds: number }) {
  return { x: keyframe.x, y: keyframe.y, scale: keyframe.scale };
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function smooth(value: number) {
  return value * value * (3 - 2 * value);
}
