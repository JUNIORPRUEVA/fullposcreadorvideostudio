import path from "node:path";
import { renderFullPosVideo } from "./render.js";
import { defaultRenderPayload } from "./payload.js";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const outputRoot = path.join(projectRoot, "storage", "renders");

const output = await renderFullPosVideo(defaultRenderPayload, {
  renderId: "demo-fullpos-premium-vertical",
  outputRoot,
  onProgress: (progress) => {
    if (progress % 10 === 0) {
      console.log(`Render progress: ${progress}%`);
    }
  }
});

console.log(`Demo video generated: ${output}`);
