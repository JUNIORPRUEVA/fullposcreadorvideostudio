import assert from "node:assert/strict";
import test from "node:test";
import {
  assetReadiness,
  idleMediaOperation,
  isLatestResponse,
  isMediaOperationRunning,
  isStarterPlaceholderScene,
  isUntouchedStarterStoryboard,
  mediaOperationLabel,
  mediaPanelStatus,
  normalizeScene,
  parseSceneJson,
  resolveSelectedScene,
  shouldReplaceStarterStoryboard,
  subtitleCues,
  visibleStoryScenes,
  type StorySceneLike
} from "./storyboard-state.js";

const STARTER: StorySceneLike[] = [
  { id: "s1", order: 1, title: "Intro", type: "BRAND_INTRO", mediaAssetId: null },
  { id: "s2", order: 2, title: "Abrir facturación", type: "CHAPTER", mediaAssetId: null },
  { id: "s3", order: 3, title: "Buscar producto", type: "SCREENSHOT", mediaAssetId: null },
  { id: "s4", order: 4, title: "Agregar producto", type: "CALLOUT", mediaAssetId: null },
  { id: "s5", order: 5, title: "Seleccionar cliente", type: "SCREENSHOT", mediaAssetId: null },
  { id: "s6", order: 6, title: "Cobrar", type: "CALLOUT", mediaAssetId: null },
  { id: "s7", order: 7, title: "Confirmación", type: "SUMMARY", mediaAssetId: null },
  { id: "s8", order: 8, title: "Resumen", type: "BRAND_OUTRO", mediaAssetId: null }
];

function realScene(id: string, order: number, title: string): StorySceneLike {
  return { id, order, title, type: "IMAGE", mediaAssetId: `asset-${id}` };
}

test("CASO DEL VIDEO: nunca se muestran los 8 pasos starter", () => {
  assert.equal(visibleStoryScenes(STARTER).length, 0);
  assert.equal(visibleStoryScenes([]).length, 0);
});

test("CASO DEL VIDEO: durante la subida (sin medio) tampoco aparecen", () => {
  // El backend puede haber creado los starters y el frontend haberlos leido:
  // mientras no haya medios, antes se mostraban los 8. Ahora nunca.
  const mixedDuringUpload = [...STARTER, { id: "p1", order: 9, title: "Paso en preparación", type: "IMAGE", mediaAssetId: null }];
  assert.equal(visibleStoryScenes(mixedDuringUpload).some((scene) => scene.title === "Abrir facturación"), false);
  assert.deepEqual(
    visibleStoryScenes(mixedDuringUpload).map((scene) => scene.id),
    ["p1"]
  );
});

test("una imagen termina en exactamente 1 paso visible", () => {
  const visible = visibleStoryScenes([realScene("r1", 1, "Captura de facturación")]);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].mediaAssetId, "asset-r1");
});

test("cinco imagenes terminan en exactamente 5 pasos, en orden y sin duplicados", () => {
  const scenes = [realScene("r3", 3, "c"), realScene("r1", 1, "a"), realScene("r5", 5, "e"), realScene("r2", 2, "b"), realScene("r4", 4, "d")];
  const visible = visibleStoryScenes(scenes);
  assert.equal(visible.length, 5);
  assert.deepEqual(
    visible.map((scene) => scene.id),
    ["r1", "r2", "r3", "r4", "r5"]
  );
  assert.equal(new Set(visible.map((scene) => scene.id)).size, 5);
});

test("recargar (F5) no vuelve a mostrar los starters", () => {
  // Un proyecto recien creado y sin medios: el editor debe salir vacio.
  assert.deepEqual(visibleStoryScenes(STARTER), []);
  // Un proyecto ya con su paso real: se ve solo el paso real.
  assert.deepEqual(
    visibleStoryScenes([realScene("r1", 1, "Captura de facturación")]).map((scene) => scene.id),
    ["r1"]
  );
});

test("subir a un proyecto existente conserva los pasos estables", () => {
  const project = [realScene("r1", 1, "Uno"), realScene("r2", 2, "Dos")];
  const duringUpload = [...project, { id: "p2", order: 3, title: "Nuevo paso", type: "IMAGE", mediaAssetId: null }];
  assert.deepEqual(
    visibleStoryScenes(duringUpload).map((scene) => scene.id),
    ["r1", "r2", "p2"]
  );
});

test("un fallo de subida no deja pasos fantasma", () => {
  const afterFailure = [...STARTER];
  assert.deepEqual(visibleStoryScenes(afterFailure), []);
  assert.equal(shouldReplaceStarterStoryboard(afterFailure), true);
  assert.equal(isUntouchedStarterStoryboard(afterFailure), true);
  assert.equal(isStarterPlaceholderScene({ id: "x", order: 1, title: "Cobrar", type: "CALLOUT", mediaAssetId: null }), true);
  // Un paso real con titulo parecido a starter NO se oculta si tiene medio.
  assert.equal(isStarterPlaceholderScene({ id: "y", order: 1, title: "Cobrar", type: "CALLOUT", mediaAssetId: "a1" }), false);
});

test("la escena seleccionada nunca apunta a un placeholder oculto", () => {
  assert.equal(resolveSelectedScene([], "s3"), undefined);
  assert.equal(resolveSelectedScene(visibleStoryScenes(STARTER), "s3"), undefined);
  const visible = visibleStoryScenes([realScene("r1", 1, "Uno"), realScene("r2", 2, "Dos")]);
  assert.equal(resolveSelectedScene(visible, "r2")?.id, "r2");
  assert.equal(resolveSelectedScene(visible, "stale-id")?.id, "r1");
});

test("una respuesta vieja del proyecto no puede sobrescribir la final", () => {
  assert.equal(isLatestResponse(4, 4), true);
  assert.equal(isLatestResponse(3, 4), false);
});

test("el panel de media nunca dice 'Sin medio' con vista previa pendiente", () => {
  assert.equal(
    mediaPanelStatus({ hasSelection: true, mediaAssetId: null, operation: idleMediaOperation, pendingLocalPreview: true, saving: false }),
    "Subiendo archivo..."
  );
  assert.equal(
    mediaPanelStatus({ hasSelection: true, mediaAssetId: null, operation: { stage: "UPLOADING" }, pendingLocalPreview: true, saving: false }),
    "Subiendo imagen..."
  );
  assert.equal(
    mediaPanelStatus({ hasSelection: true, mediaAssetId: null, operation: { stage: "ASSOCIATING" }, pendingLocalPreview: true, saving: false }),
    "Guardando paso..."
  );
  assert.equal(
    mediaPanelStatus({ hasSelection: true, mediaAssetId: "a1", operation: idleMediaOperation, pendingLocalPreview: false, saving: false }),
    "Guardado ✓"
  );
  assert.equal(
    mediaPanelStatus({ hasSelection: true, mediaAssetId: null, operation: idleMediaOperation, pendingLocalPreview: false, saving: true }),
    "Guardando..."
  );
});

test("REGRESION: con pasos propios NO se exigen los recursos por tipo antiguos", () => {
  // Caso exacto del error en la app: "Faltan recursos para un video premium:
  // Facturación, Productos / inventario, Reportes, Móvil" aunque el usuario ya
  // habia subido sus capturas en los pasos.
  const required = [
    { type: "billing", label: "Facturación", required: true },
    { type: "products", label: "Productos / inventario", required: true },
    { type: "reports", label: "Reportes", required: true },
    { type: "mobile", label: "Móvil", required: true }
  ];
  const scenes: StorySceneLike[] = [{ id: "r1", order: 1, title: "Captura", type: "IMAGE", mediaAssetId: "a1" }];
  assert.deepEqual(assetReadiness({ scenes, requiredFields: required, uploadedTypes: [] }), { ok: true });
});

test("con pasos, un paso sin medio bloquea con su nombre", () => {
  const scenes: StorySceneLike[] = [
    { id: "r1", order: 1, title: "Uno", type: "IMAGE", mediaAssetId: "a1" },
    { id: "r2", order: 2, title: "Dos", type: "IMAGE", mediaAssetId: null }
  ];
  const readiness = assetReadiness({ scenes, requiredFields: [], uploadedTypes: [] });
  assert.equal(readiness.ok, false);
  assert.match(readiness.ok ? "" : readiness.message, /"Dos"/);
});

test("sin pasos se mantiene la exigencia de recursos del flujo de plantilla", () => {
  const required = [{ type: "billing", label: "Facturación", required: true }];
  const readiness = assetReadiness({ scenes: [], requiredFields: required, uploadedTypes: [] });
  assert.equal(readiness.ok, false);
  assert.match(readiness.ok ? "" : readiness.message, /Facturación/);
  assert.deepEqual(assetReadiness({ scenes: [], requiredFields: required, uploadedTypes: ["billing"] }), { ok: true });
});

test("etiquetas de progreso por lotes", () => {
  assert.equal(mediaOperationLabel({ stage: "UPLOADING", index: 2, total: 5 }), "Subiendo imagen (2 de 5)...");
  assert.equal(mediaOperationLabel({ stage: "IDLE" }), "");
  assert.equal(isMediaOperationRunning({ stage: "UPLOADING" }), true);
  assert.equal(isMediaOperationRunning({ stage: "COMMITTING" }), true);
  assert.equal(isMediaOperationRunning(idleMediaOperation), false);
  assert.equal(isMediaOperationRunning({ stage: "ERROR" }), false);
});

test("REGRESION: customSubtitles como TEXTO JSON no rompe la pantalla", () => {
  // Caso exacto del error en produccion: "selected.customSubtitles.map is not a function".
  const fromDatabase: unknown = '[{"start":0,"end":3,"text":"Factura más rápido"}]';
  assert.equal(typeof (fromDatabase as { map?: unknown }).map, "undefined");
  const cues = subtitleCues(fromDatabase);
  assert.equal(Array.isArray(cues), true);
  assert.equal(cues.length, 1);
  assert.equal(cues.map((cue) => cue.text).join("\n"), "Factura más rápido");
});

test("subtitleCues siempre devuelve un array utilizable", () => {
  assert.deepEqual(subtitleCues("[]"), []);
  assert.deepEqual(subtitleCues("no es json"), []);
  assert.deepEqual(subtitleCues(undefined), []);
  assert.deepEqual(subtitleCues(null), []);
  assert.deepEqual(subtitleCues(""), []);
  assert.deepEqual(subtitleCues(["texto suelto"]), []);
  assert.equal(subtitleCues([{ start: 0, end: 2, text: "Uno" }]).length, 1);
  assert.equal(subtitleCues([{ start: 0, end: 2, text: "   " }]).length, 0);
  assert.equal(typeof subtitleCues("{").map, "function");
});

test("parseSceneJson acepta objeto, array, texto y basura", () => {
  assert.deepEqual(parseSceneJson("[1]", []), [1]);
  assert.deepEqual(parseSceneJson([2], []), [2]);
  assert.deepEqual(parseSceneJson('{"a":1}', {}), { a: 1 });
  assert.deepEqual(parseSceneJson("{mal", []), []);
  assert.deepEqual(parseSceneJson("", []), []);
  assert.deepEqual(parseSceneJson(null, []), []);
});

test("normalizeScene deja la escena lista para la interfaz", () => {
  const scene = normalizeScene({ id: "s1", title: "Paso", customSubtitles: '[{"start":0,"end":4,"text":"Texto"}]' });
  assert.equal(scene.id, "s1");
  assert.equal(scene.title, "Paso");
  assert.equal(Array.isArray(scene.customSubtitles), true);
  assert.equal(scene.customSubtitles.length, 1);
  assert.equal(normalizeScene({ id: "s2" }).customSubtitles.length, 0);
});
