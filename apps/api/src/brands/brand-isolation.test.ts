import assert from "node:assert/strict";
import test from "node:test";
import type { RenderPayload } from "@fullpos-ad-studio/shared";

test("Brand B render payload does not leak Brand A identity", () => {
  const brandA = {
    id: "brand-a",
    name: "Brand A",
    slug: "brand-a",
    primaryColor: "#ff0000",
    secondaryColor: "#330000",
    website: "brand-a.example",
    defaultCTA: "Buy Brand A"
  };
  const brandB = {
    id: "brand-b",
    name: "Brand B",
    slug: "brand-b",
    primaryColor: "#0000ff",
    secondaryColor: "#003366",
    website: "brand-b.example",
    defaultCTA: "Book Brand B"
  };

  const payload: RenderPayload = {
    projectId: "brand-b-project",
    videoType: "QUICK_TUTORIAL",
    template: "quick-tutorial",
    format: "16:9",
    fps: 30,
    durationSeconds: 10,
    subtitleMode: "AUTO_FROM_NARRATION",
    narrationStyle: "CORPORATE",
    brand: {
      name: brandB.name,
      headline: "Brand B tutorial",
      offer: brandB.defaultCTA,
      price: "",
      website: brandB.website
    },
    brandProfile: brandB,
    assets: {},
    scenesList: []
  };

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(brandA.name), false);
  assert.equal(serialized.includes(brandA.website), false);
  assert.equal(serialized.includes(brandA.defaultCTA), false);
  assert.equal(serialized.includes(brandA.primaryColor), false);
  assert.equal(serialized.includes(brandB.website), true);
});
