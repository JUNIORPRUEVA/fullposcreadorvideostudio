import assert from "node:assert/strict";
import test from "node:test";

/*
 * El timeout de sintesis se lee al importar el modulo, asi que este archivo usa una
 * importacion dinamica despues de fijar la variable (node --test aísla cada archivo).
 */
test("un motor que no responde se reporta como timeout, no como cuelgue", async () => {
  process.env.VOICE_ENGINE_TIMEOUT_MS = "50";
  const { VoiceEngineClient, VoiceEngineUnavailableError } = await import("./voice-engine.client.js");

  const original = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as typeof fetch;

  try {
    const client = new VoiceEngineClient();
    await assert.rejects(
      () => client.synthesize({ text: "texto", voice: "ef_dora", speed: 1, pauseMs: 300, format: "wav" }),
      (error: unknown) => {
        assert.ok(error instanceof VoiceEngineUnavailableError);
        assert.match(error.message, /no respondio/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = original;
  }
});
