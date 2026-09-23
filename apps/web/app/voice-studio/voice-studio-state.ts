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

/** Se muestra tal cual cuando el modelo no documenta el genero: no se inventa. */
export const GENDER_UNSPECIFIED = "Género no especificado";

/** Locales que cuentan como español latinoamericano para el filtro. */
export const LATAM_LOCALE = /^es_(AR|BO|CL|CO|CR|CU|DO|EC|GT|HN|MX|NI|PA|PE|PR|PY|SV|US|UY|VE|419)$/i;

export type VoiceOptionView = {
  /** Id nativo del motor (ef_dora, es_AR-daniela-high). */
  id: string;
  /** Id unico en toda la app: `motor:id`. Es el valor del selector. */
  key: string;
  engine: string;
  name: string;
  gender: string | null;
  language: string;
  locale: string | null;
  region: string | null;
  quality: string | null;
  license: string | null;
  commercialOk: boolean | null;
  sourceUrl: string | null;
  available: boolean;
  note: string | null;
};

export type VoiceEngineGroupView = {
  id: string;
  label: string;
  installed: boolean;
  reason: string | null;
  voices: VoiceOptionView[];
};

/** Filtros del selector de voz. */
export type VoiceFilter = "all" | "female" | "male" | "latam";

export const VOICE_FILTERS: Array<{ id: VoiceFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "female", label: "Femeninas" },
  { id: "male", label: "Masculinas" },
  { id: "latam", label: "Latinoamérica" }
];

/** Nombre visible de cada motor en la interfaz. */
export const ENGINE_LABELS: Record<string, string> = {
  kokoro: "Kokoro",
  piper: "Español latino / Piper"
};

export type VoiceGenerationView = {
  id: string;
  fileName: string;
  voice: string;
  voiceKey?: string;
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
  /** Carpeta del dia donde quedo el archivo (null si no se pudo determinar). */
  folder: string | null;
  /** Ruta relativa para mostrar (nunca absoluta). */
  savedIn: string;
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
  /** Voz elegida como `motor:id` (vacio = sin elegir). */
  voiceKey: string;
  speed: number;
  pauseMs: number;
  format: "wav" | "mp3";
};

export type VoiceStudioPhase = "idle" | "loading" | "previewing" | "generating" | "done" | "error";

export type TextCount = { characters: number; words: number };

export const DEFAULT_SETTINGS: VoiceStudioSettings = {
  voiceKey: "",
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
  voice?: VoiceOptionView | null;
}): boolean {
  if (state.phase === "generating" || state.phase === "previewing" || state.phase === "loading") return false;
  if (!state.engineReady) return false;
  if (!state.settings.voiceKey) return false;
  // Una voz sin modelo descargado no puede generar.
  if (state.voice && !state.voice.available) return false;
  return countText(state.text).characters > 0;
}

export function isPreviewEnabled(state: {
  settings: VoiceStudioSettings;
  phase: VoiceStudioPhase;
  engineReady: boolean;
  voice?: VoiceOptionView | null;
}): boolean {
  if (state.phase === "generating" || state.phase === "previewing" || state.phase === "loading") return false;
  if (!state.engineReady || !state.settings.voiceKey) return false;
  if (state.voice && !state.voice.available) return false;
  return true;
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

export function buildGeneratePayload(text: string, settings: VoiceStudioSettings, voice?: VoiceOptionView | null) {
  const target = splitVoiceKey(settings.voiceKey);
  return {
    text,
    voice: voice?.id ?? target.voiceId,
    engine: voice?.engine ?? target.engine,
    speed: clampSpeed(settings.speed),
    pauseMs: clampPause(settings.pauseMs),
    format: settings.format
  };
}

export function buildPreviewPayload(settings: VoiceStudioSettings, voice?: VoiceOptionView | null) {
  const target = splitVoiceKey(settings.voiceKey);
  return {
    text: PREVIEW_TEXT,
    voice: voice?.id ?? target.voiceId,
    engine: voice?.engine ?? target.engine,
    speed: clampSpeed(settings.speed)
  };
}

/**
 * Cuerpo de PUT /voice/voice-preference. La Voz FullPOS guarda el motor, la voz, su
 * locale y la velocidad, asi que funciona igual con Kokoro o con Piper.
 */
export function buildPreferencePayload(voice: VoiceOptionView | null, settings: VoiceStudioSettings) {
  const target = splitVoiceKey(settings.voiceKey);
  return {
    engine: voice?.engine ?? target.engine,
    voiceId: voice?.id ?? target.voiceId,
    voiceName: voice?.name ?? null,
    locale: voice?.locale ?? null,
    defaultSpeed: clampSpeed(settings.speed),
    defaultPauseMs: clampPause(settings.pauseMs)
  };
}

/** Une una URL relativa firmada al origen real del API. */
export function absoluteMediaUrl(apiUrl: string, path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

// ------------------------------------------------------------- seleccion

/** Separa `motor:id`. Con un valor sin motor devuelve solo el id. */
export function splitVoiceKey(key: string | null | undefined): { engine: string; voiceId: string } {
  const value = (key ?? "").trim();
  const index = value.indexOf(":");
  if (index <= 0) return { engine: "", voiceId: value };
  return { engine: value.slice(0, index), voiceId: value.slice(index + 1) };
}

export function engineLabel(engine: string): string {
  return ENGINE_LABELS[engine] ?? engine ?? "Motor";
}

/** Ej: "Daniela · Argentina · Piper · High". Solo con datos conocidos. */
export function voiceLabel(voice: VoiceOptionView): string {
  const quality = voice.quality ? voice.quality.charAt(0).toUpperCase() + voice.quality.slice(1) : null;
  return [voice.name, voice.region ?? voice.locale, engineLabel(voice.engine), quality]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** Datos verificados para mostrar debajo del selector (chips). */
export function voiceChips(voice: VoiceOptionView): string[] {
  const chips = [voice.region ?? voice.locale ?? "Español", engineLabel(voice.engine)];
  if (voice.quality) chips.push(voice.quality.toUpperCase());
  chips.push(voice.gender ?? GENDER_UNSPECIFIED);
  if (voice.commercialOk === false) chips.push("Licencia a revisar para uso comercial");
  if (!voice.available) chips.push("Modelo no descargado");
  return chips;
}

/** Motor al que pertenece una voz concreta (para los grupos vacios tras filtrar). */
export function engineOfKey(key: string | null | undefined): string {
  return splitVoiceKey(key).engine;
}

function normalized(value: string | null): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function matchesFilter(voice: VoiceOptionView, filter: VoiceFilter): boolean {
  if (filter === "female") return normalized(voice.gender) === "femenina";
  if (filter === "male") return normalized(voice.gender) === "masculina";
  if (filter === "latam") return Boolean(voice.locale && LATAM_LOCALE.test(voice.locale));
  return true;
}

/** Filtra las voces conservando los grupos de motor (con sus avisos). */
export function buildVoiceGroups(
  engines: VoiceEngineGroupView[],
  voices: VoiceOptionView[],
  filter: VoiceFilter
): VoiceEngineGroupView[] {
  const source = engines.length
    ? engines.map((group) => ({ ...group, voices: group.voices.length ? group.voices : voices.filter((voice) => voice.engine === group.id) }))
    : [...new Set(voices.map((voice) => voice.engine))].map((engine) => ({
        id: engine,
        label: engineLabel(engine),
        installed: true,
        reason: null,
        voices: voices.filter((voice) => voice.engine === engine)
      }));

  return source
    .map((group) => ({ ...group, voices: group.voices.filter((voice) => matchesFilter(voice, filter)) }))
    .filter((group) => group.voices.length > 0);
}

export function findVoice(voices: VoiceOptionView[], key: string | null | undefined): VoiceOptionView | null {
  if (!key) return null;
  return voices.find((voice) => voice.key === key) ?? null;
}

/** Elige la voz: la preferida si sigue disponible; si no, la primera usable. */
export function resolveVoiceSelection(voices: VoiceOptionView[], preferredKey: string | null | undefined): string {
  if (!voices.length) return "";
  const preferred = findVoice(voices, preferredKey);
  if (preferred?.available) return preferred.key;
  const usable = voices.find((voice) => voice.available);
  return (usable ?? voices[0]).key;
}

export function rememberFullposVoice(voice: Pick<VoiceOptionView, "key" | "name">) {
  return JSON.stringify({ key: voice.key, voiceName: voice.name, savedAt: new Date().toISOString() });
}

export function readRememberedVoice(raw: string | null): { key: string; voiceName: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { key?: unknown; voiceId?: unknown; engine?: unknown; voiceName?: unknown };
    const name = typeof parsed.voiceName === "string" ? parsed.voiceName : null;
    if (typeof parsed.key === "string" && parsed.key) return { key: parsed.key, voiceName: name };
    // Compatibilidad con lo guardado en la Fase 1 (solo voiceId): era Kokoro.
    if (typeof parsed.voiceId === "string" && parsed.voiceId) {
      const engine = typeof parsed.engine === "string" && parsed.engine ? parsed.engine : "kokoro";
      return { key: `${engine}:${parsed.voiceId}`, voiceName: name };
    }
    return null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- parseo

/** Carpeta del dia a partir de la URL servida por el API (/voice/files/<carpeta>/<archivo>). */
export function folderFromAudioUrl(audioUrl: string): string | null {
  const match = /\/voice\/files\/([a-z0-9-]{1,32})\//i.exec(audioUrl ?? "");
  return match ? match[1] : null;
}

/** Texto que se muestra al usuario: relativo y con barra final. */
export function savedInLabel(generation: Pick<VoiceGenerationView, "savedIn" | "folder">): string {
  const base =
    generation.savedIn ||
    (generation.folder ? `storage/generated-audio/${generation.folder}` : "storage/generated-audio");
  return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Cuerpo de POST /voice/open-folder. Solo viaja el NOMBRE de la carpeta (o nada para
 * la raiz): el backend resuelve la ruta, el navegador nunca manda una.
 */
export function buildOpenFolderPayload(folder: string | null | undefined): { folder?: string } {
  return folder ? { folder } : {};
}

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

export type ParsedVoices = {
  voices: VoiceOptionView[];
  engines: VoiceEngineGroupView[];
  defaultVoiceKey: string;
  defaultEngine: string;
  label: string;
};

function parseVoiceOption(item: unknown): VoiceOptionView | null {
  const voice = asRecord(item);
  if (!voice) return null;
  const id = readString(voice, "id");
  if (!id) return null;
  const engine = readString(voice, "engine") || "kokoro";
  const text = (key: string) => {
    const value = voice[key];
    return typeof value === "string" && value ? value : null;
  };
  return {
    id,
    key: readString(voice, "key") || `${engine}:${id}`,
    engine,
    name: readString(voice, "name") || id,
    // Genero: null si la fuente oficial no lo dice (no se inventa).
    gender: text("gender"),
    language: readString(voice, "language") || "es",
    // Si el motor no publica locale, el idioma es lo unico verificable.
    locale: text("locale") ?? (readString(voice, "language") || null),
    region: text("region"),
    quality: text("quality"),
    license: text("license"),
    commercialOk: typeof voice.commercialOk === "boolean" ? voice.commercialOk : null,
    sourceUrl: text("sourceUrl"),
    available: voice.available !== false,
    note: text("note")
  };
}

/** Voces del API (lista plana + grupos por motor). Nunca lanza. */
export function parseVoices(payload: unknown): ParsedVoices {
  const record = asRecord(payload);
  const flat = Array.isArray(record?.voices) ? (record?.voices as unknown[]) : [];
  const voices = flat.map(parseVoiceOption).filter((voice): voice is VoiceOptionView => voice !== null);

  const engines: VoiceEngineGroupView[] = [];
  for (const item of Array.isArray(record?.engines) ? (record?.engines as unknown[]) : []) {
    const group = asRecord(item);
    if (!group) continue;
    const id = readString(group, "id");
    if (!id) continue;
    const groupVoices = (Array.isArray(group.voices) ? (group.voices as unknown[]) : [])
      .map(parseVoiceOption)
      .filter((voice): voice is VoiceOptionView => voice !== null);
    engines.push({
      id,
      // Los nombres de grupo que pide el producto mandan sobre la etiqueta del motor.
      label: ENGINE_LABELS[id] ?? (readString(group, "label") || engineLabel(id)),
      installed: group.installed !== false,
      reason: typeof group.reason === "string" && group.reason ? group.reason : null,
      voices: groupVoices
    });
  }

  const defaultVoiceId = readString(record ?? {}, "defaultVoiceId");
  const defaultEngine = readString(record ?? {}, "defaultEngine");

  // El API manda la lista plana y los grupos; si alguna voz solo viniera dentro de su
  // grupo, se anade aqui para que la seleccion y el filtro siempre la encuentren.
  const known = new Set(voices.map((voice) => voice.key));
  for (const engine of engines) {
    for (const voice of engine.voices) {
      if (!known.has(voice.key)) {
        known.add(voice.key);
        voices.push(voice);
      }
    }
  }

  const defaultVoiceKey = voices.find(
    (voice) => voice.id === defaultVoiceId && (!defaultEngine || voice.engine === defaultEngine)
  )?.key;

  return {
    voices,
    engines,
    defaultVoiceKey: defaultVoiceKey ?? "",
    defaultEngine,
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
  const folder = readString(record, "folder") || folderFromAudioUrl(audioUrl);
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
    masterUrl: typeof record.masterUrl === "string" && record.masterUrl ? record.masterUrl : null,
    folder,
    savedIn: readString(record, "savedIn") || (folder ? `storage/generated-audio/${folder}` : "storage/generated-audio")
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
  const engine = generation.engine || splitVoiceKey(generation.voiceKey).engine;
  return [
    {
      label: "Voz",
      value: `${generation.voiceName ? `${generation.voiceName} (${generation.voice})` : generation.voice}${engine ? ` · ${engineLabel(engine)}` : ""}`
    },
    { label: "Duracion", value: formatDuration(generation.durationSeconds) },
    { label: "Tamano", value: formatBytes(generation.bytes) },
    { label: "Formato", value: generation.format.toUpperCase() },
    { label: "Archivo", value: generation.fileName }
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

export function voiceLabelForResult(generation: VoiceGenerationView): string {
  const target = splitVoiceKey(generation.voiceKey ?? `${generation.engine}:${generation.voice}`);
  return `Voz ${generation.voiceName ?? target.voiceId} (${target.voiceId}) · ${target.engine}`;
}
