import test from "node:test";
import assert from "node:assert/strict";
import { validateProjectInput } from "./validation.js";

test("project validation applies MVP defaults", () => {
  const input = validateProjectInput({
    name: "Demo",
    headline: "Tu negocio bajo control",
    offer: "7 días gratis",
    price: "Desde RD$1,000/mes",
    website: "fullposcloud.fulltechrd.com"
  });

  assert.equal(input.productName, undefined);
  assert.equal(input.template, "fullpos-premium-vertical");
  assert.equal(input.format, "9:16");
});
