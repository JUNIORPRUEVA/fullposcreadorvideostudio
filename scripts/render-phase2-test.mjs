import path from "node:path";
import { renderFullPosVideo } from "../packages/video/dist/index.js";

const root = process.cwd();
const asset = (name) => path.join(root, "assets", "demo", "e2e", name);

await renderFullPosVideo({
  projectId: "phase2-premium-test",
  template: "fullpos-premium-vertical",
  format: "9:16",
  fps: 30,
  durationSeconds: 25,
  brand: {
    name: "FullPOS Cloud",
    headline: "Tu negocio bajo control",
    subheadline: "Facturación, inventario y reportes en una sola plataforma.",
    offer: "7 DÍAS GRATIS",
    price: "Desde RD$1,000/mes",
    website: "fullposcloud.fulltechrd.com"
  },
  assets: {
    logo: asset("logo.png"),
    billing: asset("billing.png"),
    products: asset("products.png"),
    reports: asset("reports.png"),
    mobile: asset("mobile.png")
  }
}, {
  renderId: "phase2-premium-test",
  outputRoot: path.join(root, "storage", "renders"),
  onProgress: (progress) => {
    if (progress % 10 === 0) console.log(`Phase 2 render: ${progress}%`);
  }
});

console.log("Phase 2 video generated.");
