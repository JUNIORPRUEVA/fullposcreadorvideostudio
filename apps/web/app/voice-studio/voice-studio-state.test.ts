import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PAUSE_MS,
  DEFAULT_SETTINGS,
  MAX_PAUSE_MS,
  PAUSE_OPTIONS,
  PREVIEW_TEXT,
  SPEED_MAX,
  SPEED_MIN,
  absoluteMediaUrl,
  buildGeneratePayload,
  buildPreviewPayload,
  clampPause,
  clampSpeed,
  countText,
  describeApiError,
  buildOpenFolderPayload,
  folderFromAudioUrl,
  formatBytes,
  formatDuration,
  isGenerateEnabled,
  isPreviewEnabled,
  parseGeneration,
  parseHealth,
  parseVoices,
  phaseMessage,
  readRememberedVoice,
  rememberFullposVoice,
  resolveVoiceSelection,
  resultRows,
  savedInLabel,
  speedLabel,
  voiceLabel
} from "./voice-studio-state";

const VOICES = [
  { id: "ef_dora", name: "Dora", gender: "Femenina", language: "es", available: true },
  { id: "em_alex", name: "Alex", gender: "Masculina", language: "es", available: true }
];

// ----------------------------------------------------------------- contador

test("el contador cuenta caracteres y palabras sin espacios sobrantes", () => {
  assert.deepEqual(countText(""), { characters: 0, words: 0 });
  assert.deepEqual(countText("   \n  "), { characters: 0, words: 0 });
  assert.deepEqual(countText("  Hola mundo.  "), { characters: 11, words: 2 });
  assert.deepEqual(countText("Bienvenido a FullPOS Cloud.\n\nEsta es una prueba."), { characters: 48, words: 8 });
});

test("el contador admite guiones largos sin limite de 500 caracteres", () => {
  const long = "palabra ".repeat(2_000);
  const counter = countText(long);
  assert.equal(counter.words, 2_000);
  assert.ok(counter.characters > 500);
});

// --------------------------------------------------------------- controles

test("la velocidad se mantiene en el rango comodo", () => {
  assert.equal(clampSpeed(0.5), SPEED_MIN);
  assert.equal(clampSpeed(9), SPEED_MAX);
  assert.equal(clampSpeed(1.004), 1);
  assert.equal(clampSpeed(Number.NaN), 1);
  assert.equal(speedLabel(1.1), "1.10x");
});

test("la pausa se mantiene entre 0 y el maximo de la interfaz", () => {
  assert.equal(clampPause(-40), 0);
  assert.equal(clampPause(9_999), MAX_PAUSE_MS);
  assert.equal(clampPause(320.4), 320);
  assert.ok(PAUSE_OPTIONS.includes(DEFAULT_PAUSE_MS as (typeof PAUSE_OPTIONS)[number]));
});

test("el boton de generar exige guion, voz y motor listo", () => {
  const base = { text: "Hola mundo.", settings: { ...DEFAULT_SETTINGS, voiceId: "ef_dora" }, phase: "idle" as const, engineReady: true };
  assert.equal(isGenerateEnabled(base), true);
  assert.equal(isGenerateEnabled({ ...base, text: "   " }), false);
  assert.equal(isGenerateEnabled({ ...base, settings: { ...base.settings, voiceId: "" } }), false);
  assert.equal(isGenerateEnabled({ ...base, engineReady: false }), false);
  assert.equal(isGenerateEnabled({ ...base, phase: "generating" }), false);
  assert.equal(isGenerateEnabled({ ...base, phase: "previewing" }), false);
  assert.equal(isGenerateEnabled({ ...base, phase: "loading" }), false);
});

test("probar voz no necesita guion", () => {
  assert.equal(isPreviewEnabled({ settings: { ...DEFAULT_SETTINGS, voiceId: "ef_dora" }, phase: "idle", engineReady: true }), true);
  assert.equal(isPreviewEnabled({ settings: { ...DEFAULT_SETTINGS, voiceId: "ef_dora" }, phase: "idle", engineReady: false }), false);
  assert.equal(isPreviewEnabled({ settings: DEFAULT_SETTINGS, phase: "idle", engineReady: true }), false);
});

// --------------------------------------------------------------- formateo

test("la duracion se muestra legible", () => {
  assert.equal(formatDuration(0), "0 s");
  assert.equal(formatDuration(3.47), "3.5 s");
  assert.equal(formatDuration(59.6), "1:00");
  assert.equal(formatDuration(125), "2:05");
});

test("el tamano se muestra en B, KB o MB", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(168_000), "164 KB");
  assert.equal(formatBytes(3_400_000), "3.2 MB");
});

// -------------------------------------------------------------- peticiones

test("el payload de generacion normaliza los ajustes", () => {
  const payload = buildGeneratePayload("Hola mundo.", { voiceId: "em_alex", speed: 5, pauseMs: 9_999, format: "mp3" });
  assert.deepEqual(payload, { text: "Hola mundo.", voice: "em_alex", speed: SPEED_MAX, pauseMs: MAX_PAUSE_MS, format: "mp3" });
});

test("el payload de prueba usa el texto fijo", () => {
  const payload = buildPreviewPayload({ ...DEFAULT_SETTINGS, voiceId: "ef_dora", speed: 0.9 });
  assert.equal(payload.text, PREVIEW_TEXT);
  assert.equal(payload.voice, "ef_dora");
  assert.equal(payload.speed, 0.9);
  assert.match(payload.text, /Bienvenido a FullPOS Cloud/);
});

test("las rutas firmadas relativas se resuelven contra el API", () => {
  assert.equal(absoluteMediaUrl("http://localhost:4000", "/voice/files/2026-09-22/a.wav"), "http://localhost:4000/voice/files/2026-09-22/a.wav");
  assert.equal(absoluteMediaUrl("http://localhost:4000/", "voice/files/a.wav"), "http://localhost:4000/voice/files/a.wav");
  assert.equal(absoluteMediaUrl("http://localhost:4000", "https://cdn.test/a.wav"), "https://cdn.test/a.wav");
  assert.equal(absoluteMediaUrl("http://localhost:4000", ""), "");
});

test("la voz por defecto cae en la preferida o en la primera disponible", () => {
  assert.equal(resolveVoiceSelection(VOICES, "em_alex"), "em_alex");
  assert.equal(resolveVoiceSelection(VOICES, "ef_inexistente"), "ef_dora");
  assert.equal(resolveVoiceSelection(VOICES, null), "ef_dora");
  assert.equal(resolveVoiceSelection([], "ef_dora"), "");
});

test("la voz FullPOS recordada sobrevive a datos corruptos", () => {
  const raw = rememberFullposVoice("em_alex", "Alex");
  assert.deepEqual(readRememberedVoice(raw)?.voiceId, "em_alex");
  assert.equal(readRememberedVoice("no es json"), null);
  assert.equal(readRememberedVoice(null), null);
  assert.equal(readRememberedVoice('{"voiceId":""}'), null);
});

// ------------------------------------------------------------------ parseo

test("se parsean las voces y la voz FullPOS guardada", () => {
  const parsed = parseVoices({
    engine: "kokoro",
    label: "Kokoro-82M (local)",
    voices: [
      { id: "ef_dora", name: "Dora", gender: "Femenina", language: "es", available: true },
      { id: "", name: "rota" }
    ],
    defaultVoiceId: "ef_dora"
  });
  assert.deepEqual(parsed.voices.map((voice) => voice.id), ["ef_dora"]);
  assert.equal(parsed.defaultVoiceId, "ef_dora");
  assert.equal(parsed.label, "Kokoro-82M (local)");
  assert.equal(voiceLabel(parsed.voices[0]), "Dora · Femenina · ef_dora");
});

test("una respuesta de voces corrupta no rompe la pagina", () => {
  assert.deepEqual(parseVoices("nada").voices, []);
  assert.deepEqual(parseVoices(null).voices, []);
  assert.equal(parseVoices({ voices: "no es lista" }).defaultVoiceId, "");
});

test("se parsea el estado del motor", () => {
  const health = parseHealth({
    ok: true,
    engineUrl: "http://127.0.0.1:4310",
    reason: null,
    engine: { installed: true },
    espeak: { available: true },
    ffmpeg: { available: true },
    formats: ["wav", "mp3"]
  });
  assert.equal(health?.ok, true);
  assert.equal(health?.installed, true);
  assert.equal(health?.ffmpegAvailable, true);
  assert.deepEqual(health?.formats, ["wav", "mp3"]);
  assert.equal(parseHealth("no es objeto"), null);
});

test("se parsea el resultado de generacion", () => {
  const generation = parseGeneration({
    id: "abc12345",
    fileName: "ef_dora-abc12345.wav",
    voice: "ef_dora",
    voiceName: "Dora",
    engine: "kokoro",
    format: "wav",
    durationSeconds: 4.2,
    bytes: 201_600,
    sampleRate: 24_000,
    speed: 1,
    pauseMs: 300,
    chunks: 3,
    createdAt: "2026-09-22T10:00:00+00:00",
    textCharacters: 120,
    textWords: 20,
    audioUrl: "/voice/files/2026-09-22/ef_dora-abc12345.wav",
    downloadUrl: "/voice/files/2026-09-22/ef_dora-abc12345.wav?download=1",
    masterUrl: null
  });
  assert.equal(generation?.id, "abc12345");
  assert.equal(generation?.chunks, 3);
  assert.equal(generation?.durationSeconds, 4.2);
  assert.equal(generation?.masterUrl, null);

  const rows = resultRows(generation!);
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Voz", "Duracion", "Tamano", "Formato", "Archivo"]
  );
  assert.equal(rows[0].value, "Dora (ef_dora)");
  assert.equal(rows[1].value, "4.2 s");
  assert.equal(rows[3].value, "WAV");
  assert.equal(rows[4].value, "ef_dora-abc12345.wav");
});

test("una respuesta de generacion incompleta se detecta", () => {
  assert.equal(parseGeneration({ id: "abc" }), null);
  assert.equal(parseGeneration(null), null);
  assert.equal(parseGeneration({ id: "abc", audioUrl: "/x.wav" })?.format, "wav");
});

// ------------------------------------------------- ubicacion y abrir carpeta

test("la ubicacion se deduce del API o de la URL firmada", () => {
  const withFields = parseGeneration({
    id: "abc12345",
    audioUrl: "/voice/files/2026-09-22/ef_dora-abc12345.wav?sig=x",
    savedIn: "storage/generated-audio/2026-09-22",
    folder: "2026-09-22"
  });
  assert.equal(withFields?.folder, "2026-09-22");
  assert.equal(savedInLabel(withFields!), "storage/generated-audio/2026-09-22/");

  // Respuesta sin los campos nuevos: se deduce de la URL (resiliencia).
  const withoutFields = parseGeneration({ id: "abc12345", audioUrl: "/voice/files/2026-09-23/ef_dora-abc12345.wav?sig=x" });
  assert.equal(withoutFields?.folder, "2026-09-23");
  assert.equal(savedInLabel(withoutFields!), "storage/generated-audio/2026-09-23/");

  // Preview (carpeta "previews") y caso degenerado.
  assert.equal(folderFromAudioUrl("/voice/files/previews/ef_dora-1.wav"), "previews");
  assert.equal(folderFromAudioUrl("sin carpeta"), null);
  assert.equal(savedInLabel({ savedIn: "", folder: null }), "storage/generated-audio/");
});

test("abrir carpeta solo envia el nombre de la carpeta (nunca una ruta)", () => {
  assert.deepEqual(buildOpenFolderPayload("2026-09-22"), { folder: "2026-09-22" });
  assert.deepEqual(buildOpenFolderPayload("previews"), { folder: "previews" });
  assert.deepEqual(buildOpenFolderPayload(null), {});
  assert.deepEqual(buildOpenFolderPayload(undefined), {});
  assert.deepEqual(buildOpenFolderPayload(""), {});
  // El NOMBRE que se envia no lleva separadores ni unidad: el backend resuelve la ruta.
  for (const folder of ["2026-09-22", "previews"]) {
    assert.doesNotMatch(String(buildOpenFolderPayload(folder).folder), /[\\/:]/);
  }
});

// ----------------------------------------------------------------- errores

test("los errores del API se explican en castellano", () => {
  assert.match(describeApiError(0, null, "http://localhost:4000"), /No se pudo conectar/);
  assert.match(describeApiError(401, { message: "Authentication required." }), /sesion expiro/);
  assert.match(describeApiError(400, { message: "El guion esta vacio." }), /El guion esta vacio/);
  assert.match(describeApiError(400, { message: ["El guion esta vacio.", "Selecciona una voz."] }), /Selecciona una voz/);
  assert.match(describeApiError(413, null), /demasiado largo/);
  assert.match(describeApiError(503, null), /npm run voice:dev/);
  assert.match(describeApiError(500, null), /error \(500\)/);
  assert.doesNotMatch(describeApiError(500, { stack: "Traceback..." }), /Traceback/);
});

test("cada fase tiene su mensaje", () => {
  assert.match(phaseMessage("generating"), /Narrando el guion/);
  assert.match(phaseMessage("loading"), /Comprobando/);
  assert.match(phaseMessage("idle"), /Listo para generar/);
  assert.match(phaseMessage("error"), /No se pudo completar/);
});
