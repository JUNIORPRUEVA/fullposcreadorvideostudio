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
  buildPreferencePayload,
  buildVoiceGroups,
  findVoice,
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
  splitVoiceKey,
  voiceChips,
  voiceLabel,
  matchesFilter,
  GENDER_UNSPECIFIED,
  type VoiceEngineGroupView,
  type VoiceFilter
} from "./voice-studio-state";

const KOKORO_VOICES = [
  {
    id: "ef_dora",
    key: "kokoro:ef_dora",
    engine: "kokoro",
    name: "Dora",
    gender: "Femenina",
    language: "es",
    locale: "es",
    region: null,
    quality: null,
    license: "Apache-2.0 (hexgrad/Kokoro-82M)",
    commercialOk: true,
    sourceUrl: "https://huggingface.co/hexgrad/Kokoro-82M",
    available: true,
    note: null
  },
  {
    id: "em_alex",
    key: "kokoro:em_alex",
    engine: "kokoro",
    name: "Alex",
    gender: "Masculina",
    language: "es",
    locale: "es",
    region: null,
    quality: null,
    license: "Apache-2.0 (hexgrad/Kokoro-82M)",
    commercialOk: true,
    sourceUrl: "https://huggingface.co/hexgrad/Kokoro-82M",
    available: true,
    note: null
  }
];

const PIPER_VOICES = [
  {
    id: "es_AR-daniela-high",
    key: "piper:es_AR-daniela-high",
    engine: "piper",
    name: "Daniela",
    gender: null,
    language: "es",
    locale: "es_AR",
    region: "Argentina",
    quality: "high",
    license: "Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)",
    commercialOk: false,
    sourceUrl: "https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_AR/daniela/high",
    available: true,
    note: "Licencia del dataset a revisar para uso comercial (CC BY-SA 4.0)."
  },
  {
    id: "es_MX-ald-medium",
    key: "piper:es_MX-ald-medium",
    engine: "piper",
    name: "Ald",
    gender: null,
    language: "es",
    locale: "es_MX",
    region: "Mexico",
    quality: "medium",
    license: "Unlicense (dominio publico)",
    commercialOk: true,
    sourceUrl: "https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/ald/medium",
    available: true,
    note: null
  },
  {
    id: "es_MX-claude-high",
    key: "piper:es_MX-claude-high",
    engine: "piper",
    name: "Claude",
    gender: null,
    language: "es",
    locale: "es_MX",
    region: "Mexico",
    quality: "high",
    license: "apache-2.0",
    commercialOk: true,
    sourceUrl: "https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/claude/high",
    available: false,
    note: "Modelo no descargado todavia: ejecuta `npm run voice:setup` para bajarlo."
  }
];

const VOICES = [...KOKORO_VOICES, ...PIPER_VOICES];

const ENGINES: VoiceEngineGroupView[] = [
  { id: "kokoro", label: "Kokoro", installed: true, reason: null, voices: KOKORO_VOICES },
  { id: "piper", label: "Español latino / Piper", installed: true, reason: null, voices: PIPER_VOICES }
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
  const base = { text: "Hola mundo.", settings: { ...DEFAULT_SETTINGS, voiceKey: "kokoro:ef_dora" }, phase: "idle" as const, engineReady: true };
  assert.equal(isGenerateEnabled(base), true);
  assert.equal(isGenerateEnabled({ ...base, text: "   " }), false);
  assert.equal(isGenerateEnabled({ ...base, settings: { ...base.settings, voiceKey: "" } }), false);
  assert.equal(isGenerateEnabled({ ...base, engineReady: false }), false);
  assert.equal(isGenerateEnabled({ ...base, phase: "generating" }), false);
  assert.equal(isGenerateEnabled({ ...base, phase: "previewing" }), false);
  assert.equal(isGenerateEnabled({ ...base, phase: "loading" }), false);
});

test("probar voz no necesita guion", () => {
  assert.equal(isPreviewEnabled({ settings: { ...DEFAULT_SETTINGS, voiceKey: "kokoro:ef_dora" }, phase: "idle", engineReady: true }), true);
  assert.equal(isPreviewEnabled({ settings: { ...DEFAULT_SETTINGS, voiceKey: "kokoro:ef_dora" }, phase: "idle", engineReady: false }), false);
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
  const payload = buildGeneratePayload("Hola mundo.", { voiceKey: "kokoro:em_alex", speed: 5, pauseMs: 9_999, format: "mp3" });
  assert.deepEqual(payload, {
    text: "Hola mundo.",
    voice: "em_alex",
    engine: "kokoro",
    speed: SPEED_MAX,
    pauseMs: MAX_PAUSE_MS,
    format: "mp3"
  });
});

test("el payload de prueba usa el texto fijo", () => {
  const payload = buildPreviewPayload({ ...DEFAULT_SETTINGS, voiceKey: "kokoro:ef_dora", speed: 0.9 });
  assert.equal(payload.text, PREVIEW_TEXT);
  assert.equal(payload.voice, "ef_dora");
  assert.equal(payload.engine, "kokoro");
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
  assert.equal(resolveVoiceSelection(VOICES, "kokoro:em_alex"), "kokoro:em_alex");
  assert.equal(resolveVoiceSelection(VOICES, "kokoro:ef_inexistente"), "kokoro:ef_dora");
  assert.equal(resolveVoiceSelection(VOICES, null), "kokoro:ef_dora");
  assert.equal(resolveVoiceSelection([], "kokoro:ef_dora"), "");
});

test("una voz preferida sin modelo descargado no se elige", () => {
  assert.equal(resolveVoiceSelection(VOICES, "piper:es_MX-claude-high"), "kokoro:ef_dora");
});

test("la voz FullPOS recordada sobrevive a datos corruptos", () => {
  const raw = rememberFullposVoice({ key: "piper:es_MX-ald-medium", name: "Ald" });
  assert.deepEqual(readRememberedVoice(raw), { key: "piper:es_MX-ald-medium", voiceName: "Ald" });
  assert.equal(readRememberedVoice("no es json"), null);
  assert.equal(readRememberedVoice(null), null);
  assert.equal(readRememberedVoice('{"voiceId":""}'), null);
});

test("lo guardado en la Fase 1 (solo voiceId) se migra a Kokoro", () => {
  assert.deepEqual(readRememberedVoice('{"voiceId":"em_alex","voiceName":"Alex"}'), {
    key: "kokoro:em_alex",
    voiceName: "Alex"
  });
});

// ------------------------------------------------------------------ parseo

test("se parsean las voces, los motores y la voz FullPOS guardada", () => {
  const parsed = parseVoices({
    engine: "kokoro",
    label: "Kokoro-82M (local)",
    engines: [
      {
        id: "piper",
        label: "Piper (local)",
        installed: true,
        reason: null,
        voices: [{ id: "es_MX-ald-medium", engine: "piper", name: "Ald", gender: null, locale: "es_MX", region: "Mexico", quality: "medium", available: true }]
      }
    ],
    voices: [
      { id: "ef_dora", name: "Dora", gender: "Femenina", language: "es", available: true },
      { id: "", name: "rota" }
    ],
    defaultVoiceId: "ef_dora",
    defaultEngine: "kokoro"
  });
  assert.deepEqual(parsed.voices.map((voice) => voice.id), ["ef_dora", "es_MX-ald-medium"]);
  assert.equal(parsed.defaultVoiceKey, "kokoro:ef_dora");
  assert.equal(parsed.defaultEngine, "kokoro");
  assert.equal(parsed.label, "Kokoro-82M (local)");
  // Una voz Kokoro: sin region y sin calidad publicada (no se inventan).
  assert.equal(parsed.voices[0].key, "kokoro:ef_dora");
  assert.equal(parsed.voices[0].region, null);
  assert.equal(parsed.voices[0].quality, null);
  assert.equal(voiceLabel(parsed.voices[0]), "Dora · es · Kokoro");
  // Una voz Piper: locale, region, calidad y genero sin especificar en el model card.
  assert.equal(parsed.engines[0].voices[0].gender, null);
  assert.equal(parsed.engines[0].voices[0].quality, "medium");
  assert.equal(voiceLabel(parsed.engines[0].voices[0]), "Ald · Mexico · Español latino / Piper · Medium");
});

test("una respuesta de voces corrupta no rompe la pagina", () => {
  assert.deepEqual(parseVoices("nada").voices, []);
  assert.deepEqual(parseVoices(null).voices, []);
  assert.equal(parseVoices({ voices: "no es lista" }).defaultVoiceKey, "");
});

// ------------------------------------------------ motores, filtros y grupos

test("las voces se agrupan por motor con el nombre pedido", () => {
  const groups = buildVoiceGroups(ENGINES, VOICES, "all");
  assert.deepEqual(groups.map((group) => group.id), ["kokoro", "piper"]);
  assert.equal(groups[0].label, "Kokoro");
  assert.equal(groups[1].label, "Español latino / Piper");
  assert.equal(groups[1].voices.length, 3);
});

test("los filtros de genero y de Latinoamerica funcionan", () => {
  const females = buildVoiceGroups(ENGINES, VOICES, "female");
  assert.deepEqual(females.flatMap((group) => group.voices.map((voice) => voice.id)), ["ef_dora"]);

  const males = buildVoiceGroups(ENGINES, VOICES, "male");
  assert.deepEqual(males.flatMap((group) => group.voices.map((voice) => voice.id)), ["em_alex"]);

  const latam = buildVoiceGroups(ENGINES, VOICES, "latam");
  assert.deepEqual(latam.map((group) => group.id), ["piper"]);
  assert.deepEqual(latam[0].voices.map((voice) => voice.locale), ["es_AR", "es_MX", "es_MX"]);
  // Kokoro no asigna pais: sus voces no entran en el filtro latinoamericano.
  assert.equal(latam.some((group) => group.id === "kokoro"), false);
});

test("un filtro sin resultados no deja grupos vacios", () => {
  const onlyAlex: VoiceEngineGroupView[] = [{ ...ENGINES[0], voices: [KOKORO_VOICES[1]] }];
  assert.deepEqual(buildVoiceGroups(onlyAlex, [KOKORO_VOICES[1]], "female"), []);
  assert.equal(matchesFilter(KOKORO_VOICES[1], "female"), false);
  assert.equal(matchesFilter(KOKORO_VOICES[1], "male"), true);
  assert.equal(matchesFilter(KOKORO_VOICES[1], "all"), true);
});

test("sin grupos del API se agrupa igual a partir de la lista plana", () => {
  const groups = buildVoiceGroups([], VOICES, "all");
  assert.deepEqual(groups.map((group) => group.id), ["kokoro", "piper"]);
  assert.equal(groups[0].voices.length, 2);
});

test("los chips muestran solo datos verificados", () => {
  assert.deepEqual(voiceChips(PIPER_VOICES[1]), ["Mexico", "Español latino / Piper", "MEDIUM", GENDER_UNSPECIFIED]);
  // Genero sin especificar + licencia a revisar + modelo descargado.
  assert.deepEqual(voiceChips(PIPER_VOICES[0]), [
    "Argentina",
    "Español latino / Piper",
    "HIGH",
    GENDER_UNSPECIFIED,
    "Licencia a revisar para uso comercial"
  ]);
  assert.equal(voiceChips(KOKORO_VOICES[0]).includes("Femenina"), true);
  assert.equal(voiceChips(PIPER_VOICES[2]).includes("Modelo no descargado"), true);
});

test("splitVoiceKey separa motor y voz (y tolera valores sueltos)", () => {
  assert.deepEqual(splitVoiceKey("piper:es_MX-ald-medium"), { engine: "piper", voiceId: "es_MX-ald-medium" });
  assert.deepEqual(splitVoiceKey("ef_dora"), { engine: "", voiceId: "ef_dora" });
  assert.deepEqual(splitVoiceKey(""), { engine: "", voiceId: "" });
  assert.deepEqual(splitVoiceKey(null), { engine: "", voiceId: "" });
});

test("findVoice localiza por clave completa", () => {
  assert.equal(findVoice(VOICES, "piper:es_MX-ald-medium")?.name, "Ald");
  assert.equal(findVoice(VOICES, "es_MX-ald-medium"), null);
  assert.equal(findVoice(VOICES, null), null);
});

test("el payload de generacion viaja con el motor elegido", () => {
  const ald = findVoice(VOICES, "piper:es_MX-ald-medium")!;
  const payload = buildGeneratePayload("Hola mundo.", { ...DEFAULT_SETTINGS, voiceKey: ald.key }, ald);
  assert.deepEqual(payload, {
    text: "Hola mundo.",
    voice: "es_MX-ald-medium",
    engine: "piper",
    speed: 1,
    pauseMs: 300,
    format: "wav"
  });
  // Sin la voz resuelta, la clave sigue bastando.
  assert.deepEqual(buildGeneratePayload("Hola.", { ...DEFAULT_SETTINGS, voiceKey: "kokoro:em_alex" }).engine, "kokoro");
});

test("el payload de prueba tambien lleva el motor", () => {
  const daniela = findVoice(VOICES, "piper:es_AR-daniela-high")!;
  const payload = buildPreviewPayload({ ...DEFAULT_SETTINGS, voiceKey: daniela.key, speed: 0.9 }, daniela);
  assert.equal(payload.voice, "es_AR-daniela-high");
  assert.equal(payload.engine, "piper");
  assert.equal(payload.text, PREVIEW_TEXT);
});

test("la Voz FullPOS guarda motor, voz, locale y velocidad", () => {
  const claude = findVoice(VOICES, "piper:es_MX-claude-high")!;
  const payload = buildPreferencePayload(claude, { ...DEFAULT_SETTINGS, voiceKey: claude.key, speed: 1.1, pauseMs: 250 });
  assert.deepEqual(payload, {
    engine: "piper",
    voiceId: "es_MX-claude-high",
    voiceName: "Claude",
    locale: "es_MX",
    defaultSpeed: 1.1,
    defaultPauseMs: 250
  });
  // Sin la voz resuelta se usan los datos de la clave (motor + id).
  const fallback = buildPreferencePayload(null, { ...DEFAULT_SETTINGS, voiceKey: "kokoro:ef_dora" });
  assert.equal(fallback.engine, "kokoro");
  assert.equal(fallback.voiceId, "ef_dora");
  assert.equal(fallback.voiceName, null);
});

test("no se puede generar con una voz sin descargar", () => {
  const claude = PIPER_VOICES[2];
  const base = { text: "Hola.", settings: { ...DEFAULT_SETTINGS, voiceKey: claude.key }, phase: "idle" as const, engineReady: true };
  assert.equal(isGenerateEnabled({ ...base, voice: claude }), false);
  assert.equal(isGenerateEnabled({ ...base, voice: PIPER_VOICES[1] }), true);
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
  assert.equal(rows[0].value, "Dora (ef_dora) · Kokoro");
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
