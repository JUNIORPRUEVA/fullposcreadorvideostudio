import type { RenderPayload } from "@fullpos-ad-studio/shared";

export const defaultRenderPayload: RenderPayload = {
  projectId: "demo",
  template: "fullpos-premium-vertical",
  format: "9:16",
  fps: 30,
  durationSeconds: 25,
  brand: {
    name: "FullPOS Cloud",
    headline: "Tu negocio bajo control",
    subheadline: "Facturación, inventario y reportes en una plataforma simple.",
    offer: "7 DÍAS GRATIS",
    price: "Desde RD$1,000/mes",
    website: "fullposcloud.fulltechrd.com"
  },
  assets: {}
};
