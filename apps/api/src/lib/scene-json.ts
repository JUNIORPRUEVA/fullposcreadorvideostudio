/*
 * Campos JSON de una escena (animation, customSubtitles, assetRefs).
 *
 * En la base de datos son columnas de TEXTO. Si se guarda un string que no es
 * JSON valido, el frontend y el render reciben basura y la pantalla revienta
 * (p.ej. "selected.customSubtitles.map is not a function"). Este saneador
 * garantiza que la columna siempre contenga JSON valido o quede vacia.
 */

export function toSceneJsonColumn(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return undefined;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
