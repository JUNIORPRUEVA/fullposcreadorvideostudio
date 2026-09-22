import assert from "node:assert/strict";
import test from "node:test";
import {
  VoiceEngineClient,
  VoiceEngineRequestError,
  VoiceEngineUnavailableError
} from "./voice-engine.client.js";

type FetchCall = { url: string; init: RequestInit | undefined };

/** Reemplaza fetch global y devuelve las llamadas capturadas. */
async function withFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
  run: (calls: FetchCall[]) => Promise<void>
) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("getHealth lee el estado del motor", async () => {
  await withFetch(
    async () =>
      jsonResponse({
        status: "ok",
        usable: true,
        engine: { id: "kokoro", label: "Kokoro-82M", installed: true, loaded: false },
        espeak: { available: true, source: "espeakng-loader" },
        ffmpeg: { available: true, path: "ffmpeg.exe" },
        formats: ["wav", "mp3"],
        limits: { maxTextChars: 100_000, chunkChars: 400, minSpeed: 0.5, maxSpeed: 2, maxPauseMs: 2000 }
      }),
    async (calls) => {
      const client = new VoiceEngineClient();
      const health = await client.health();
      assert.equal(health.usable, true);
      assert.deepEqual(health.formats, ["wav", "mp3"]);
      assert.equal(calls[0].url, `${client.url}/health`);
      assert.equal(calls[0].init?.method, "GET");
    }
  );
});

test("un error del motor conserva codigo y mensaje", async () => {
  await withFetch(
    async () => jsonResponse({ error: { code: "voice_not_found", message: "La voz no existe." } }, 400),
    async () => {
      const client = new VoiceEngineClient();
      await assert.rejects(
        () => client.voices(),
        (error: unknown) => {
          assert.ok(error instanceof VoiceEngineRequestError);
          assert.equal(error.code, "voice_not_found");
          assert.equal(error.status, 400);
          assert.equal(error.message, "La voz no existe.");
          return true;
        }
      );
    }
  );
});

test("una respuesta ilegible se trata como motor no disponible", async () => {
  await withFetch(
    async () => new Response("<html>bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }),
    async () => {
      const client = new VoiceEngineClient();
      await assert.rejects(
        () => client.health(),
        (error: unknown) => {
          assert.ok(error instanceof VoiceEngineUnavailableError);
          assert.match(error.message, /ilegible/);
          return true;
        }
      );
    }
  );
});

test("un motor apagado produce un mensaje accionable", async () => {
  await withFetch(
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => {
      const client = new VoiceEngineClient();
      await assert.rejects(
        () => client.synthesize({ text: "hola", voice: "ef_dora", speed: 1, pauseMs: 300, format: "wav" }),
        (error: unknown) => {
          assert.ok(error instanceof VoiceEngineUnavailableError);
          assert.match(error.message, /voice:dev/);
          return true;
        }
      );
    }
  );
});

test("la sintesis envia el payload esperado", async () => {
  await withFetch(
    async () =>
      jsonResponse({
        generationId: "abc12345",
        fileName: "ef_dora-abc12345.wav",
        relativePath: "generated-audio/2026-09-22/ef_dora-abc12345.wav",
        masterRelativePath: null,
        format: "wav",
        durationSeconds: 3.5,
        bytes: 168_000,
        sampleRate: 24_000,
        voice: "ef_dora",
        speed: 1,
        pauseMs: 300,
        engine: "kokoro",
        createdAt: "2026-09-22T10:00:00+00:00",
        textCharacters: 40,
        textWords: 8,
        chunks: []
      }),
    async (calls) => {
      const client = new VoiceEngineClient();
      const result = await client.synthesize({
        text: "Bienvenido a FullPOS Cloud.",
        voice: "ef_dora",
        speed: 1,
        pauseMs: 300,
        format: "wav"
      });
      assert.equal(result.durationSeconds, 3.5);
      const init = calls[0].init;
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        text: "Bienvenido a FullPOS Cloud.",
        voice: "ef_dora",
        speed: 1,
        pauseMs: 300,
        format: "wav"
      });
      assert.equal((init?.headers as Record<string, string>)["content-type"], "application/json");
    }
  );
});

test("el token opcional viaja en la cabecera cuando esta configurado", async () => {
  const previous = process.env.VOICE_ENGINE_TOKEN;
  process.env.VOICE_ENGINE_TOKEN = "secreto-de-prueba";
  try {
    await withFetch(
      async () => jsonResponse({ ok: true }),
      async (calls) => {
        const client = new VoiceEngineClient();
        await client.health();
        const headers = calls[0].init?.headers as Record<string, string>;
        assert.equal(headers["x-voice-token"], "secreto-de-prueba");
      }
    );
  } finally {
    if (previous === undefined) delete process.env.VOICE_ENGINE_TOKEN;
    else process.env.VOICE_ENGINE_TOKEN = previous;
  }
});

test("la URL del motor es configurable y se normaliza", () => {
  const previous = process.env.VOICE_ENGINE_URL;
  process.env.VOICE_ENGINE_URL = "http://127.0.0.1:4311/";
  try {
    assert.equal(new VoiceEngineClient().url, "http://127.0.0.1:4311");
  } finally {
    if (previous === undefined) delete process.env.VOICE_ENGINE_URL;
    else process.env.VOICE_ENGINE_URL = previous;
  }
});
