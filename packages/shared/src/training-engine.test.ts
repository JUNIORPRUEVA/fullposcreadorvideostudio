import assert from "node:assert/strict";
import test from "node:test";
import { automaticSubtitleCues, calloutVisible, interpolateFocusKeyframes, timelineDurationSeconds, validateTrimRange } from "./training-engine.js";

test("screen recording trim validation rejects invalid ranges", () => {
  assert.equal(validateTrimRange({ trimStartSeconds: -1, trimEndSeconds: 4, mediaDurationSeconds: 20 }).ok, false);
  assert.equal(validateTrimRange({ trimStartSeconds: 8, trimEndSeconds: 7, mediaDurationSeconds: 20 }).ok, false);
  assert.equal(validateTrimRange({ trimStartSeconds: 8, trimEndSeconds: 25, mediaDurationSeconds: 20 }).ok, false);
});

test("screen recording trim validation returns selected duration", () => {
  const result = validateTrimRange({ trimStartSeconds: 32, trimEndSeconds: 47, mediaDurationSeconds: 120 });
  assert.equal(result.ok, true);
  assert.equal(result.selectedDurationSeconds, 15);
});

test("focus keyframes interpolate smoothly across multiple points", () => {
  const focus = interpolateFocusKeyframes([
    { timeSeconds: 0, x: 0.5, y: 0.5, scale: 1 },
    { timeSeconds: 2, x: 0.72, y: 0.28, scale: 1 },
    { timeSeconds: 3, x: 0.72, y: 0.28, scale: 2 },
    { timeSeconds: 7, x: 0.5, y: 0.5, scale: 1 }
  ], 2.5);
  assert.equal(focus.x, 0.72);
  assert.equal(focus.y, 0.28);
  assert.equal(focus.scale, 1.5);
});

test("callout timing only shows annotation inside configured window", () => {
  const callout = { startTime: 3, endTime: 6 };
  assert.equal(calloutVisible(callout, 2.9), false);
  assert.equal(calloutVisible(callout, 4), true);
  assert.equal(calloutVisible(callout, 6.1), false);
});

test("automatic subtitles split narration into timed readable cues", () => {
  const cues = automaticSubtitleCues("Uno dos tres cuatro cinco seis siete ocho nueve diez once doce", 12, 4);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues.map((cue) => cue.text), ["Uno dos tres cuatro", "cinco seis siete ocho", "nueve diez once doce"]);
  assert.equal(cues[2].end, 12);
});

test("long training timeline can exceed thirty seconds", () => {
  const duration = timelineDurationSeconds(Array.from({ length: 60 }, () => ({ duration: 5 })));
  assert.equal(duration, 300);
});
