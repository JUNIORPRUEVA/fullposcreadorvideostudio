import test from "node:test";
import assert from "node:assert/strict";
import { defaultRenderPayload } from "./payload.js";

test("demo payload matches first template requirements", () => {
  assert.equal(defaultRenderPayload.template, "fullpos-premium-vertical");
  assert.equal(defaultRenderPayload.format, "9:16");
  assert.equal(defaultRenderPayload.fps, 30);
  assert.equal(defaultRenderPayload.durationSeconds, 25);
});
