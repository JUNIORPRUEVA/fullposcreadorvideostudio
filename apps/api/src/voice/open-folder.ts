import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { assertInside, generatedAudioRoot } from "../lib/paths.js";

/*
 * "Abrir carpeta" para FullPOS Voice Studio (herramienta LOCAL de Windows).
 *
 * Regla de seguridad: el navegador NUNCA envia una ruta. Solo puede pedir la raiz
 * de audios generados o una de sus carpetas conocidas (una fecha o "previews").
 * La ruta se resuelve siempre aqui, dentro de storage/generated-audio.
 */

/** Carpetas aceptadas. No admite separadores, unidades ni "..". */
const FOLDER_PATTERN = /^(\d{4}-\d{2}-\d{2}|previews)$/;

export type FolderResolution =
  | { ok: true; folder: string | null; directory: string; relative: string }
  | { ok: false; reason: "invalid" | "missing"; message: string };

export type OpenResult = { launched: boolean; platform: string; reason?: string };

/**
 * Traduce lo pedido por el navegador a una carpeta real.
 * - vacio/ausente -> raiz de audios generados
 * - fecha o "previews" -> esa subcarpeta (debe existir)
 * - cualquier otra cosa -> invalid (no se toca el disco)
 */
export function resolveGeneratedAudioFolder(
  requested: unknown,
  options: { root?: string } = {}
): FolderResolution {
  const root = options.root ?? generatedAudioRoot;
  const raw = typeof requested === "string" ? requested.trim() : "";

  if (raw && !FOLDER_PATTERN.test(raw)) {
    return {
      ok: false,
      reason: "invalid",
      message: "Carpeta no valida: solo se puede abrir la raiz de audios generados o una carpeta de fecha."
    };
  }

  const directory = raw ? path.join(root, raw) : root;
  try {
    // Defensa en profundidad: el patron ya lo impide, pero se comprueba igual.
    assertInside(root, directory);
  } catch {
    return { ok: false, reason: "invalid", message: "Carpeta fuera de storage/generated-audio." };
  }

  if (!existsSync(directory)) {
    return {
      ok: false,
      reason: "missing",
      message: raw
        ? `La carpeta ${raw} todavia no existe en storage/generated-audio.`
        : "Todavia no hay audios generados en storage/generated-audio."
    };
  }

  return {
    ok: true,
    folder: raw || null,
    directory,
    relative: raw ? `storage/generated-audio/${raw}` : "storage/generated-audio"
  };
}

/**
 * Abre la carpeta en el explorador de Windows.
 *
 * `explorer.exe` devuelve a veces codigo 1 aunque la ventana se abra, asi que NO se
 * usa el codigo de salida como criterio: se comprueba la carpeta y se lanza el
 * proceso con `shell: false` (sin interprete de comandos y con un unico argumento).
 */
export function openInExplorer(
  directory: string,
  options: { platform?: NodeJS.Platform; spawnFn?: typeof spawn; exists?: (value: string) => boolean } = {}
): OpenResult {
  const platform = options.platform ?? process.platform;
  const spawnFunction = options.spawnFn ?? spawn;
  const exists = options.exists ?? existsSync;

  if (platform !== "win32") {
    return {
      launched: false,
      platform,
      reason: "Abrir la carpeta solo esta disponible en Windows (Voice Studio es una herramienta local)."
    };
  }
  if (!exists(directory)) {
    return { launched: false, platform, reason: "La carpeta ya no existe en el disco." };
  }

  try {
    const child = spawnFunction("explorer.exe", [directory], {
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: false
    });
    child.unref?.();
    return { launched: true, platform };
  } catch (error) {
    return {
      launched: false,
      platform,
      reason: error instanceof Error ? error.message : "No se pudo abrir el explorador de Windows."
    };
  }
}
