/**
 * Pruebas de render (sin navegador) de la pagina de Voice Studio.
 *
 * `renderToStaticMarkup` monta el arbol real de React: si un accesorio falta o el
 * estado inicial es incoherente, estos tests fallan. La interaccion completa se
 * valida ademas en el navegador (smoke test real).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EngineStatusCard, VoiceStudioClient, VoiceStudioError, VoiceStudioResult } from "./VoiceStudioClient";
import type { VoiceGenerationView } from "./voice-studio-state";

const API_URL = "http://localhost:4000";

const GENERATION: VoiceGenerationView = {
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
  audioUrl: "/voice/files/2026-09-22/ef_dora-abc12345.wav?sig=x&exp=1",
  downloadUrl: "/voice/files/2026-09-22/ef_dora-abc12345.wav?sig=x&exp=1&download=1",
  masterUrl: null,
  folder: "2026-09-22",
  savedIn: "storage/generated-audio/2026-09-22"
};

test("la pagina renderiza titulo, subtitulo y el guion", () => {
  const html = renderToStaticMarkup(<VoiceStudioClient apiUrl={API_URL} />);
  assert.match(html, /FullPOS Voice Studio/);
  assert.match(html, /Genera narraciones consistentes para tus videos/);
  assert.match(html, /<textarea/);
  assert.match(html, /data-testid="voice-script"/);
});

test("el contador arranca en cero", () => {
  const html = renderToStaticMarkup(<VoiceStudioClient apiUrl={API_URL} />);
  assert.match(html, /0 caracteres/);
  assert.match(html, /0 palabras/);
});

test("los controles de voz, velocidad, pausa y formato estan presentes", () => {
  const html = renderToStaticMarkup(<VoiceStudioClient apiUrl={API_URL} />);
  assert.match(html, /data-testid="voice-select"/);
  assert.match(html, /data-testid="voice-speed"/);
  assert.match(html, /data-testid="voice-pause"/);
  assert.match(html, /type="range"/);
  assert.match(html, /min="0.85"/);
  assert.match(html, /max="1.15"/);
  assert.match(html, /WAV/);
  // Sin FFmpeg confirmado, MP3 aparece deshabilitado (no se ofrece en falso).
  assert.match(html, /MP3 \(FFmpeg no disponible\)/);
  const mp3Input = html.match(/<input[^>]*value="mp3"[^>]*>/)?.[0] ?? "";
  assert.match(mp3Input, /disabled/);
  const wavInput = html.match(/<input[^>]*value="wav"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(wavInput, /disabled/);
  assert.match(wavInput, /checked/);
});

test("el estado inicial avisa de que se esta comprobando el motor", () => {
  const html = renderToStaticMarkup(<VoiceStudioClient apiUrl={API_URL} />);
  assert.match(html, /Comprobando el motor de voz/);
  assert.match(html, /voice-generate/);
  assert.match(html, /voice-open-folder-root/);
  assert.match(html, /Abrir carpeta de audios/);
  assert.match(html, /npm run voice:dev/);
});

test("el estado de generacion se muestra al usuario", () => {
  const generating = renderToStaticMarkup(<VoiceStudioClient apiUrl={API_URL} />);
  assert.match(generating, /data-testid="voice-phase"/);
  assert.match(generating, /Listo para generar|Comprobando/);
});

test("el resultado renderiza el reproductor y los datos finales", () => {
  const html = renderToStaticMarkup(<VoiceStudioResult generation={GENERATION} apiUrl={API_URL} />);
  assert.match(html, /Narracion generada/);
  assert.match(html, /data-testid="voice-player"/);
  assert.match(html, /<audio/);
  assert.match(html, new RegExp(`${API_URL}/voice/files/2026-09-22/ef_dora-abc12345\\.wav\\?sig=x&amp;exp=1`));
  assert.match(html, /Dora \(ef_dora\)/);
  assert.match(html, /4\.2 s/);
  assert.match(html, /197 KB/);
  assert.match(html, /WAV/);
  assert.match(html, /ef_dora-abc12345\.wav/);
  assert.match(html, /data-testid="voice-download"/);
  assert.match(html, /download=/);
});

test("el resultado muestra donde quedo el archivo y permite abrir la carpeta", () => {
  const opened: Array<string | null> = [];
  const html = renderToStaticMarkup(
    <VoiceStudioResult
      generation={GENERATION}
      apiUrl={API_URL}
      onOpenFolder={(folder) => opened.push(folder)}
    />
  );
  // Ruta relativa, nunca absoluta.
  assert.match(html, /Guardado localmente en:/);
  assert.match(html, /data-testid="voice-saved-in">storage\/generated-audio\/2026-09-22\//);
  assert.doesNotMatch(html, /C:\\\\/);
  // Botones pedidos: reproducir, descargar y abrir carpeta.
  assert.match(html, /data-testid="voice-play"/);
  assert.match(html, /Reproducir/);
  assert.match(html, /data-testid="voice-download"/);
  assert.match(html, /data-testid="voice-open-folder"/);
  assert.match(html, /Abrir carpeta/);
});

test("el resultado tambien ofrece el WAV maestro cuando el formato es MP3", () => {
  const html = renderToStaticMarkup(
    <VoiceStudioResult generation={{ ...GENERATION, format: "mp3", masterUrl: "/voice/files/2026-09-22/ef_dora-abc12345.wav?sig=x&exp=1" }} apiUrl={API_URL} />
  );
  assert.match(html, /WAV maestro/);
});

test("el error es visible y accesible", () => {
  const html = renderToStaticMarkup(<VoiceStudioError message="El motor de voz no responde." />);
  assert.match(html, /role="alert"/);
  assert.match(html, /El motor de voz no responde/);
  assert.match(html, /data-testid="voice-error"/);
});

test("el aviso de motor disponible lista espeak, FFmpeg y formatos", () => {
  const html = renderToStaticMarkup(
    <EngineStatusCard
      health={{
        ok: true,
        engineUrl: "http://127.0.0.1:4310",
        reason: null,
        installed: true,
        espeakAvailable: true,
        ffmpegAvailable: true,
        formats: ["wav", "mp3"]
      }}
      engineLabel="Kokoro-82M (local)"
      notice={null}
      apiUrl={API_URL}
    />
  );
  assert.match(html, /Motor listo · Kokoro-82M \(local\)/);
  assert.match(html, /espeak-ng: disponible/);
  assert.match(html, /FFmpeg \(MP3\): disponible/);
  assert.match(html, /Formatos: wav, mp3/);
});

test("el aviso de motor caido explica que hacer", () => {
  const html = renderToStaticMarkup(
    <EngineStatusCard
      health={{
        ok: false,
        engineUrl: "http://127.0.0.1:4310",
        reason: "El motor Kokoro no esta instalado.",
        installed: false,
        espeakAvailable: false,
        ffmpegAvailable: true,
        formats: ["wav"]
      }}
      engineLabel="Kokoro-82M (local)"
      notice="El motor Kokoro no esta instalado."
      apiUrl={API_URL}
    />
  );
  assert.match(html, /Motor de voz no disponible/);
  assert.match(html, /El motor Kokoro no esta instalado/);
  assert.match(html, /npm run voice:setup/);
});
