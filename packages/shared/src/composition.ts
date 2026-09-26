/*
 * Especificacion unica de composicion para escenas con captura de software.
 *
 * La captura del usuario es SAGRADA: se presenta sin opacidad, sin filtros, sin
 * blur y sin recorte. Estas constantes y funciones son la unica fuente de
 * verdad del layout, y las usan tanto el render (Remotion/FFmpeg) como la
 * interfaz, para que la vista previa y el MP4 final coincidan.
 */

export type SceneComposition = {
  canvasWidth: number;
  canvasHeight: number;
  /** Columna de marca a la izquierda (color solido, nunca derivada de la captura). */
  railWidth: number;
  /** Barra inferior con el texto narrativo. */
  footerHeight: number;
  /** Margen seguro alrededor de la captura. */
  margin: number;
};

export const COURSE_SCENE_COMPOSITION: SceneComposition = {
  canvasWidth: 1920,
  canvasHeight: 1080,
  railWidth: 300,
  footerHeight: 88,
  margin: 32
};

/** Tipografia del footer (1080p). */
export const CAPTION_PRIMARY_SIZE = 30;
export const CAPTION_SECONDARY_SIZE = 20;
/** Maximo de lineas por nivel del footer. */
export const CAPTION_MAX_LINES = 1;

export const SCREENSHOT_RADIUS = 12;
/** Sombra suave: separa la captura del fondo sin degradarla. */
export const SCREENSHOT_SHADOW = "0 26px 70px rgba(2, 8, 20, .45)";

/**
 * Zona util de la captura. Con el layout por defecto la captura ocupa ~81% del
 * ancho (objetivo 80-85%) y nunca queda detras del rail ni del footer.
 */
export function screenshotFrame(composition: SceneComposition = COURSE_SCENE_COMPOSITION, options?: { withRail?: boolean }) {
  const withRail = options?.withRail !== false;
  const x = (withRail ? composition.railWidth : 0) + composition.margin;
  const y = composition.margin;
  return {
    x,
    y,
    width: composition.canvasWidth - x - composition.margin,
    height: composition.canvasHeight - composition.footerHeight - y - composition.margin
  };
}

/** Proporcion del ancho del lienzo que ocupa la captura (0..1). */
export function screenshotWidthShare(composition: SceneComposition = COURSE_SCENE_COMPOSITION, options?: { withRail?: boolean }) {
  return screenshotFrame(composition, options).width / composition.canvasWidth;
}

/** Contraste seguro para texto sobre un color solido de marca. */
export function readableTextOn(background: string) {
  const hex = (background ?? "").replace("#", "").trim();
  const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return "#ffffff";
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#0b1728" : "#ffffff";
}

const GENERIC_TITLES = new Set(["nueva escena", "nuevo paso", "sin titulo", "sin título", "untitled", "escena", "paso"]);

/**
 * Fase 7: no se inventan titulos visibles. Un titulo generico ("Nueva escena")
 * o un nombre de archivo no se renderiza como texto del video.
 */
export function isMeaningfulCaption(text?: string | null) {
  const value = (text ?? "").trim();
  if (!value) return false;
  if (GENERIC_TITLES.has(value.toLowerCase())) return false;
  if (/^paso\s+\d+$/i.test(value)) return false;
  if (value.length > 120) return false;
  if (/\.(png|jpe?g|webp|mp4|webm|mov)$/i.test(value)) return false;
  return true;
}

export type FooterCaption = { primary: string; secondary: string };

/**
 * Fase 8/10/20: todo el texto narrativo vive en el footer. El texto sale de la
 * narracion del paso (narrativa real del usuario); el titulo solo si aporta.
 */
export function footerCaption(scene: { narrationScript?: string | null; title?: string | null }): FooterCaption {
  const narration = (scene.narrationScript ?? "").trim();
  if (narration) {
    const parts = narration.split(/(?<=[.!?])\s+/).filter((part) => part.trim());
    return { primary: parts[0]?.trim() ?? "", secondary: parts.slice(1).join(" ").trim() };
  }
  if (isMeaningfulCaption(scene.title)) return { primary: (scene.title ?? "").trim(), secondary: "" };
  return { primary: "", secondary: "" };
}

/** Fase 6: el rail solo lleva modulo/capitulo corto. Nada narrativo. */
export function railModule(scene: { chapter?: string | null; title?: string | null }, maxLength = 22) {
  const chapter = (scene.chapter ?? "").trim();
  const candidate = chapter || (isMeaningfulCaption(scene.title) ? (scene.title ?? "").trim() : "");
  if (!candidate) return "";
  return candidate.length > maxLength ? `${candidate.slice(0, maxLength - 1).trimEnd()}…` : candidate;
}

/** Numeracion de escena del rail (01, 02...). */
export function sceneNumberLabel(index: number) {
  return String(Math.max(1, index + 1)).padStart(2, "0");
}
