/**
 * Logica pura de FullPOS Voice Studio.
 *
 * Vive aparte del componente a proposito: el contador, la validacion, la
 * traduccion de errores y el parseo de respuestas se prueban sin navegador.
 */

export const DEFAULT_API_URL = "http://localhost:4000";
export const VOICE_STUDIO_PATH = "/voice-studio";

/** Rango comodo para narracion comercial (el motor acepta 0.5 - 2.0). */
export const SPEED_MIN = 0.85;
export const SPEED_MAX = 1.15;
export const SPEED_STEP = 0.05;
export const DEFAULT_SPEED = 1;

export const PAUSE_OPTIONS = [0, 200, 300, 500, 800] as const;
export const DEFAULT_PAUSE_MS = 300;
export const MAX_PAUSE_MS = 1000;

/** Clave local de la "Voz FullPOS" (espejo de la que guarda el API en la BD). */
export const FULLPOS_VOICE_STORAGE_KEY = "voiceStudioFullposVoice";

/** Texto fijo de prueba de voces: igual para todas, para poder compararlas. */
export const PREVIEW_TEXT =
  "Bienvenido a FullPOS Cloud. En este tutorial aprenderás a configurar tu negocio y realizar tus primeras ventas.";

export type VoiceOptionView = {
  id: string;
  name: string;
  gender: string;
  language: string;
  available: boolean;
};

export type VoiceGenerationView = {
  id: string;
  fileName: string;
  voice: string;
  voiceName: string | null;
  engine: string;
  format: string;
  durationSeconds: number;
  bytes: number;
  sampleRate: number;
  speed: number;
  pauseMs: number;
  chunks: number;
  createdAt: string;
  textCharacters: number;
  textWords: number;
  audioUrl: string;
  downloadUrl: string;
  masterUrl: string | null;
};

export type VoiceHealthView = {
  ok: boolean;
  engineUrl: string;
  reason: string | null;
  installed: boolean;
  espeakAvailable: boolean;
  ffmpegAvailable: boolean;
  formats: string[];
};

export type VoiceStudioSettings = {
  voiceId: string;
  speed: number;
  pauseMs: number;
  format: "wav" | "mp3";
};

export type VoiceStudioPhase = "idle" | "loading" | "previewing" | "generating" | "done" | "error";

export type TextCount = { characters: number; words: number };

export const DEFAULT_SETTINGS: VoiceStudioSettings = {
  voiceId: "",
  speed: DEFAULT_SPEED,
  pauseMs: DEFAULT_PAUSE_MS,
  format: "wav"
};

// ------------------------------------------------------------------ texto

export function countText(text: string): TextCount {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { characters: 0, words: 0 };
  return {
    characters: trimmed.length,
    words: trimmed.split(/\s+/).filter(Boolean).length
  };
}

export function isGenerateEnabled(state: {
  text: string;
  settings: VoiceStudioSettings;
  phase: VoiceStudioPhase;
  engineReady: boolean;
}): boolean {
  if (state.phase === "generating" || state.phase === "previewing" || state.phase === "loading") return false;
  if (!state.engineReady) return false;
  if (!state.settings.voiceId) return false;
  return countText(state.text).characters > 0;
}

export function isPreviewEnabled(state: { settings: VoiceStudioSettings; phase: VoiceStudioPhase; engineReady: boolean }): boolean {
  if (state.phase === "generating" || state.phase === "previewing" || state.phase === "loading") return false;
  return state.engineReady && Boolean(state.settings.voiceId);
}

// ------------------------------------------------------------- controles

export function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPEED;
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, value));
  return Math.round(clamped * 100) / 100;
}

export function clampPause(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PAUSE_MS;
  return Math.min(MAX_PAUSE_MS, Math.max(0, Math.round(value)));
}

export function speedLabel(speed: number): string {
  return `${clampSpeed(speed).toFixed(2)}x`;
}

// ------------------------------------------------------------- formateo

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 s";
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("es-DO").format(Number.isFinite(value) ? value : 0);
}

export function formatClock(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" });
}

// -------------------------------------------------------------- peticiones

export function buildGeneratePayload(text: string, settings: VoiceStudioSettings) {
  return {
    text,
    voice: settings.voiceId,
    speed: clampSpeed(settings.speed),
    pauseMs: clampPause(settings.pauseMs),
    format: settings.format
  };
}

export function buildPreviewPayload(settings: VoiceStudioSettings) {
  return {
    text: PREVIEW_TEXT,
    voice: settings.voiceId,
    speed: clampSpeed(settings.speed)
  };
}

/** Une una URL relativa firmada al origen real del API. */
export function absoluteMediaUrl(apiUrl: string, path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function resolveVoiceSelection(voices: VoiceOptionView[], preferredId: string | null | undefined): string {
  if (!voices.length) return "";
  const preferred = preferredId ? voices.find((voice) => voice.id === preferredId) : undefined;
  if (preferred) return preferred.id;
  return voices.find((voice) => voice.available)?.id ?? voices[0].id;
}

export function rememberFullposVoice(voiceId: string, name: string | null) {
  return JSON.stringify({ voiceId, voiceName: name, savedAt: new Date().toISOString() });
}

export function readRememberedVoice(raw: string | null): { voiceId: string; voiceName: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { voiceId?: unknown; voiceName?: unknown };
    if (typeof parsed.voiceId !== "string" || !parsed.voiceId) return null;
    return { voiceId: parsed.voiceId, voiceName: typeof parsed.voiceName === "string" ? parsed.voiceName : null };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- parseo

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function readNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Voces del API. Devuelve [] si la respuesta no tiene la forma esperada. */
export function parseVoices(payload: unknown): { voices: VoiceOptionView[]; defaultVoiceId: string; label: string } {
  const record = asRecord(payload);
  const list = Array.isArray(record?.voices) ? (record?.voices as unknown[]) : [];
  const voices: VoiceOptionView[] = [];
  for (const item of list) {
    const voice = asRecord(item);
    if (!voice) continue;
    const id = readString(voice, "id");
    if (!id) continue;
    voices.push({
      id,
      name: readString(voice, "name") || id,
      gender: readString(voice, "gender"),
      language: readString(voice, "language") || "es",
      available: voice.available !== false
    });
  }
  return {
    voices,
    defaultVoiceId: readString(record ?? {}, "defaultVoiceId"),
    label: readString(record ?? {}, "label") || "Kokoro"
  };
}

export function parseHealth(payload: unknown): VoiceHealthView | null {
  const record = asRecord(payload);
  if (!record) return null;
  const engine = asRecord(record.engine);
  const espeak = asRecord(record.espeak);
  const ffmpeg = asRecord(record.ffmpeg);
  return {
    ok: record.ok === true,
    engineUrl: readString(record, "engineUrl"),
    reason: typeof record.reason === "string" ? record.reason : null,
    installed: engine?.installed === true,
    espeakAvailable: espeak?.available === true,
    ffmpegAvailable: ffmpeg?.available === true,
    formats: Array.isArray(record.formats) ? record.formats.filter((item): item is string => typeof item === "string") : ["wav"]
  };
}

/** Resultado de generacion. Devuelve null si la respuesta esta corrupta. */
export function parseGeneration(payload: unknown): VoiceGenerationView | null {
  const record = asRecord(payload);
  if (!record) return null;
  const id = readString(record, "id");
  const audioUrl = readString(record, "audioUrl");
  if (!id || !audioUrl) return null;
  return {
    id,
    fileName: readString(record, "fileName") || `${id}.wav`,
    voice: readString(record, "voice"),
    voiceName: typeof record.voiceName === "string" ? record.voiceName : null,
    engine: readString(record, "engine"),
    format: readString(record, "format") || "wav",
    durationSeconds: readNumber(record, "durationSeconds"),
    bytes: readNumber(record, "bytes"),
    sampleRate: readNumber(record, "sampleRate"),
    speed: readNumber(record, "speed") || DEFAULT_SPEED,
    pauseMs: readNumber(record, "pauseMs"),
    chunks: readNumber(record, "chunks") || 1,
    createdAt: readString(record, "createdAt"),
    textCharacters: readNumber(record, "textCharacters"),
    textWords: readNumber(record, "textWords"),
    audioUrl,
    downloadUrl: readString(record, "downloadUrl") || audioUrl,
    masterUrl: typeof record.masterUrl === "string" && record.masterUrl ? record.masterUrl : null
  };
}

/** Mensaje entendible para el usuario. Nunca muestra JSON crudo ni trazas. */
export function describeApiError(status: number, payload: unknown, apiUrl = DEFAULT_API_URL): string {
  if (status === 0) {
    return `No se pudo conectar con el API del estudio (${apiUrl}). Comprueba que este en marcha.`;
  }
  const record = asRecord(payload);
  const raw = record?.message;
  const message = Array.isArray(raw) ? raw.filter((item) => typeof item === "string").join(" ") : typeof raw === "string" ? raw : "";
  if (status === 401) return "La sesion expiro. Vuelve a entrar al estudio y reintenta.";
  if (status === 404) return message || "El recurso pedido ya no existe.";
  if (status === 503) {
    return message || "El motor de voz local no esta disponible. Arrancalo con `npm run voice:dev`.";
  }
  if (message) return message;
  if (status === 400) return "La peticion no es valida. Revisa el guion, la voz y los ajustes.";
  if (status === 413) return "El guion es demasiado largo para una sola generacion.";
  return `El servicio de voz respondio con un error (${status}).`;
}

// ----------------------------------------------------------------- resumen

export function resultRows(generation: VoiceGenerationView): Array<{ label: string; value: string }> {
  return [
    { label: "Voz", value: generation.voiceName ? `${generation.voiceName} (${generation.voice})` : generation.voice },
    { label: "Duracion", value: formatDuration(generation.durationSeconds) },
    { label: "Tamano", value: formatBytes(generation.bytes) },
    { label: "Formato", value: generation.format.toUpperCase() },
    { label: "Velocidad", value: speedLabel(generation.speed) },
    { label: "Fragmentos", value: formatCount(generation.chunks) }
  ];
}

export function phaseMessage(phase: VoiceStudioPhase): string {
  switch (phase) {
    case "loading":
      return "Comprobando el motor de voz...";
    case "previewing":
      return "Generando la prueba de voz...";
    case "generating":
      return "Narrando el guion. Un guion largo puede tardar unos minutos.";
    case "done":
      return "Narracion lista.";
    case "error":
      return "No se pudo completar la operacion.";
    default:
      return "Listo para generar.";
  }
}

export function voiceLabel(voice: VoiceOptionView): string {
  const gender = voice.gender ? ` · ${voice.gender}` : "";
  return `${voice.name}${gender} · ${voice.id}`;
}
