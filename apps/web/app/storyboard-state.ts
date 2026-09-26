/*
 * Estado del storyboard para el editor del Video Studio.
 *
 * Regla de oro: la UI solo muestra (A) el ultimo estado estable confirmado o
 * (B) un estado explicito de operacion. Nunca snapshots intermedios del
 * backend ni pasos que el usuario no creo.
 *
 * Estas funciones son puras para poder probarlas sin navegador.
 */

export type StorySceneLike = {
  id: string;
  order: number;
  title: string;
  type: string;
  mediaAssetId?: string | null;
};

const STARTER_TITLES = [
  "Intro",
  "Abrir facturación",
  "Buscar producto",
  "Agregar producto",
  "Seleccionar cliente",
  "Cobrar",
  "Confirmación",
  "Resumen"
];

const STARTER_TYPES = ["BRAND_INTRO", "CHAPTER", "SCREENSHOT", "CALLOUT", "SUMMARY", "BRAND_OUTRO", "TITLE", "CTA", "DEVICE_SHOWCASE"];

export function isStarterPlaceholderScene(scene: StorySceneLike) {
  if (scene.mediaAssetId) return false;
  return STARTER_TITLES.includes(scene.title) && STARTER_TYPES.includes(scene.type);
}

/** Todo el storyboard es todavia el andamiaje starter (nada del usuario). */
export function isUntouchedStarterStoryboard(scenes: StorySceneLike[]) {
  if (!scenes.length) return false;
  if (scenes.some((scene) => scene.mediaAssetId)) return false;
  return scenes.every((scene) => isStarterPlaceholderScene(scene));
}

/** El backend nunca debe sembrar starters si el proyecto se arma con archivos. */
export function shouldReplaceStarterStoryboard(scenes: StorySceneLike[]) {
  return isUntouchedStarterStoryboard(scenes);
}

/**
 * Pasos que el editor puede mostrar. Los placeholders de plantilla no son
 * trabajo del usuario: nunca se pintan como pasos del video.
 *
 * Antes esta funcion dependia de `mediaAssetId` ("si todavia no hay medio,
 * muestra todo"), y por eso los 8 pasos starter aparecian justo durante la
 * subida. Ahora el filtro es estable: no depende del estado de la subida.
 */
export function visibleStoryScenes<T extends StorySceneLike>(scenes: T[]): T[] {
  const ordered = [...scenes].sort((a, b) => a.order - b.order);
  if (!ordered.length) return ordered;
  if (isUntouchedStarterStoryboard(ordered)) return [];
  return ordered.filter((scene) => !isStarterPlaceholderScene(scene));
}

export type MediaOperationStage = "IDLE" | "UPLOADING" | "ASSOCIATING" | "COMMITTING" | "ERROR";

export type AssetRequirement = { type: string; label: string; required?: boolean };

/**
 * ¿Se puede generar el video? El flujo actual arma el video con los archivos de
 * los pasos: si hay pasos, cada uno necesita su medio y NO hacen falta los
 * recursos por tipo del flujo antiguo (billing, products, reports, mobile).
 */
export function assetReadiness(input: { scenes: StorySceneLike[]; requiredFields: AssetRequirement[]; uploadedTypes: Iterable<string> }): { ok: true } | { ok: false; message: string } {
  if (input.scenes.length) {
    const pending = input.scenes.find((scene) => !scene.mediaAssetId);
    if (pending) return { ok: false, message: `El paso "${pending.title}" no tiene imagen o video asociado.` };
    return { ok: true };
  }
  const uploaded = new Set(input.uploadedTypes);
  const missing = input.requiredFields.filter((field) => field.required && !uploaded.has(field.type)).map((field) => field.label);
  if (missing.length) return { ok: false, message: `Faltan recursos para el video: ${missing.join(", ")}. Sube las capturas en el paso 3 (Editar).` };
  return { ok: true };
}

export type SubtitleCue = { start: number; end: number; text: string };

/*
 * Los campos JSON de la escena (customSubtitles, animation, assetRefs) viven en
 * la base de datos como TEXTO. Un string no es un array: hacer
 * `customSubtitles.map(...)` reventaba la pantalla con
 * "selected.customSubtitles.map is not a function". Siempre se parsea antes de
 * usar, sin importar si llega string, array u objeto.
 */
export function parseSceneJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as T | null;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/** Cues de subtitulo personalizados, siempre como array valido. */
export function subtitleCues(value: unknown): SubtitleCue[] {
  const parsed = parseSceneJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((cue) => (cue && typeof cue === "object" ? (cue as Record<string, unknown>) : null))
    .filter((cue): cue is Record<string, unknown> => cue !== null)
    .map((cue) => ({ start: Number(cue.start ?? 0), end: Number(cue.end ?? 0), text: String(cue.text ?? "") }))
    .filter((cue) => cue.text.trim().length > 0);
}

/** Escena tal como llega del backend, con los campos JSON ya normalizados. */
export function normalizeScene<T extends object>(scene: T & { customSubtitles?: unknown }): T & { customSubtitles: SubtitleCue[] } {
  return { ...scene, customSubtitles: subtitleCues(scene.customSubtitles) };
}

/**
 * Escena seleccionada: solo puede ser una escena visible y estable. Nunca un
 * placeholder oculto ni una escena de un proyecto anterior.
 */
export function resolveSelectedScene<T extends { id: string }>(visibleScenes: T[], selectedId: string | undefined): T | undefined {
  if (!visibleScenes.length) return undefined;
  return visibleScenes.find((scene) => scene.id === selectedId) ?? visibleScenes[0];
}

/** Solo la ultima peticion lanzada puede escribir el estado (latest-wins):
 *  una respuesta vieja del proyecto no puede sobrescribir el estado final. */
export function isLatestResponse(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId;
}

export type MediaOperation = {
  stage: MediaOperationStage;
  /** Numero de archivo que se esta subiendo y total (para lotes). */
  index?: number;
  total?: number;
  filename?: string;
  error?: string;
};

export const idleMediaOperation: MediaOperation = { stage: "IDLE" };

export function mediaOperationLabel(operation: MediaOperation) {
  const batch = operation.total && operation.total > 1 ? ` (${operation.index ?? 1} de ${operation.total})` : "";
  if (operation.stage === "UPLOADING") return `Subiendo imagen${batch}...`;
  if (operation.stage === "ASSOCIATING") return "Guardando paso...";
  if (operation.stage === "COMMITTING") return "Confirmando cambios...";
  if (operation.stage === "ERROR") return operation.error ?? "No se pudo agregar la imagen.";
  return "";
}

/** Una operacion en curso mantiene la UI en modo "trabajando" (no muestra snapshots). */
export function isMediaOperationRunning(operation: MediaOperation) {
  return operation.stage === "UPLOADING" || operation.stage === "ASSOCIATING" || operation.stage === "COMMITTING";
}

/**
 * Etiqueta honesta del panel derecho. Nunca puede decir "Sin medio" mientras
 * el usuario ve la imagen: si hay una operacion en curso o una vista previa
 * local pendiente, se declara lo que esta pasando.
 */
export function mediaPanelStatus(input: { hasSelection: boolean; mediaAssetId?: string | null; operation: MediaOperation; pendingLocalPreview: boolean; saving: boolean }) {
  if (!input.hasSelection) return input.operation.stage === "IDLE" ? "Sin pasos todavía" : mediaOperationLabel(input.operation);
  if (input.operation.stage === "UPLOADING" || input.operation.stage === "ASSOCIATING" || input.operation.stage === "COMMITTING") return mediaOperationLabel(input.operation);
  if (input.pendingLocalPreview) return "Subiendo archivo...";
  if (input.saving) return "Guardando...";
  return input.mediaAssetId ? "Guardado ✓" : "Sin medio asociado";
}
