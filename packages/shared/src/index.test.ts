import test from "node:test";
import assert from "node:assert/strict";
import { allowedAssetMimeTypes, PRODUCT_NAME } from "./index.js";

test("shared constants expose FullPOS defaults", () => {
  assert.equal(PRODUCT_NAME, "FullPOS Cloud");
  assert.ok(allowedAssetMimeTypes.includes("image/png"));
});
