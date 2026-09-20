import test from "node:test";
import assert from "node:assert/strict";
import { allowedAssetMimeTypes, PRODUCT_NAME } from "./index.js";

test("shared constants expose generic video studio defaults", () => {
  assert.equal(PRODUCT_NAME, "Video Studio");
  assert.ok(allowedAssetMimeTypes.includes("image/png"));
});
