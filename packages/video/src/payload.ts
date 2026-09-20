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
  assets: {},
  audio: {
    voiceoverEnabled: true,
    musicEnabled: true,
    voiceoverScript: "Con FullPOS Cloud tienes el control de tu negocio estés donde estés. Factura de forma rápida, administra tus productos y mantén tu inventario organizado. Consulta tus ventas y reportes para tomar mejores decisiones. Trabaja desde tu computadora, Android o iPhone. FullPOS Cloud. Tu negocio bajo control. Pruébalo gratis por siete días.",
    voiceProfile: "dominican-promotional",
    voiceName: "Dominicana promocional",
    voiceSpeed: 1,
    musicVolume: 0.15,
    voiceVolume: 1,
    voiceStartSeconds: 0.4
  },
  scenes: {
    billing: { scale: 1.18, y: -18, fit: "cover" },
    products: { scale: 1.22, y: -12, fit: "cover" },
    reports: { scale: 1.2, y: -10, fit: "cover" },
    mobile: { scale: 1.08, y: -24, fit: "cover" },
    devices: { scale: 1.05, y: -16, fit: "cover" }
  },
  visual: {
    style: "saas-premium",
    motion: "cinematic"
  }
};
