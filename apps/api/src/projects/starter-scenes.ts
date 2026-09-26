/*
 * Los "starter scenes" son andamiaje de plantilla (8 pasos de ejemplo para un
 * curso). Un proyecto que el usuario construye con sus propios archivos NUNCA
 * debe nacer con ellos: el editor mostraba esos pasos fantasma como si fueran
 * trabajo del usuario.
 *
 * Regla explicita: solo se siembran si el cliente lo pide con
 * `starterStoryboard: true`. Es un dato del cliente, no una heuristica.
 */

export type StarterSceneSeed = {
  type: string;
  order: number;
  chapter?: string;
  title: string;
  duration: number;
  narrationScript?: string;
};

export function shouldSeedStarterScenes(starterStoryboard: unknown) {
  return starterStoryboard === true;
}

export function starterScenesFor(videoType: string, starterStoryboard?: unknown): StarterSceneSeed[] {
  if (!shouldSeedStarterScenes(starterStoryboard)) return [];
  if (videoType === "COURSE") {
    return [
      { type: "BRAND_INTRO", order: 1, chapter: "Introducción", title: "Intro", duration: 4, narrationScript: "Bienvenido al curso." },
      { type: "CHAPTER", order: 2, chapter: "Facturación", title: "Abrir facturación", duration: 6, narrationScript: "Vamos a abrir el módulo de facturación." },
      { type: "SCREENSHOT", order: 3, chapter: "Facturación", title: "Buscar producto", duration: 7, narrationScript: "Busca el producto que deseas vender." },
      { type: "CALLOUT", order: 4, chapter: "Facturación", title: "Agregar producto", duration: 7, narrationScript: "Pulsa agregar para incluirlo en el ticket." },
      { type: "SCREENSHOT", order: 5, chapter: "Cliente", title: "Seleccionar cliente", duration: 6, narrationScript: "Selecciona el cliente correspondiente." },
      { type: "CALLOUT", order: 6, chapter: "Cobro", title: "Cobrar", duration: 7, narrationScript: "Revisa el total y pulsa cobrar." },
      { type: "SUMMARY", order: 7, chapter: "Resumen", title: "Confirmación", duration: 5, narrationScript: "La venta queda registrada correctamente." },
      { type: "BRAND_OUTRO", order: 8, chapter: "Resumen", title: "Resumen", duration: 4, narrationScript: "Continúa practicando con tu equipo." }
    ];
  }
  if (videoType === "QUICK_TUTORIAL" || videoType === "SUPPORT") {
    return [
      { type: "TITLE", order: 1, title: "Cómo registrar una venta", duration: 2, narrationScript: "Aprende a registrar una venta rápidamente." },
      { type: "SCREENSHOT", order: 2, title: "Buscar producto", duration: 6, narrationScript: "Busca el producto en facturación." },
      { type: "CALLOUT", order: 3, title: "Agregar y cobrar", duration: 7, narrationScript: "Agrega el producto y pulsa cobrar." },
      { type: "SUMMARY", order: 4, title: "Resultado", duration: 4, narrationScript: "Listo, la venta fue creada." }
    ];
  }
  return [
    { type: "BRAND_INTRO", order: 1, title: "Intro", duration: 3, narrationScript: "Presenta tu marca." },
    { type: "DEVICE_SHOWCASE", order: 2, title: "Producto", duration: 8, narrationScript: "Muestra el producto principal." },
    { type: "CTA", order: 3, title: "CTA", duration: 4, narrationScript: "Invita a tomar acción." }
  ];
}
