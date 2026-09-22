import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { generatedAudioRoot } from "../lib/paths.js";
import { VoiceEngineRequestError, VoiceEngineUnavailableError, type EngineSynthesisResult } from "./voice-engine.client.js";
import { VoiceService } from "./voice.service.js";

const VOICES = [
  { id: "ef_dora", name: "Dora", gender: "Femenina", language: "es", engine: "kokoro", available: true },
  { id: "em_alex", name: "Alex", gender: "Masculina", language: "es", engine: "kokoro", available: true }
];

function synthesis(overrides: Partial<EngineSynthesisResult> = {}): EngineSynthesisResult {
  return {
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
    chunks: [{ index: 0, characters: 40, pauseMs: 0, elapsedSeconds: 0.4 }],
    ...overrides
  };
}

type EngineOverrides = {
  health?: () => Promise<unknown>;
  voices?: () => Promise<unknown>;
  synthesize?: (body: { text: string; voice: string; speed: number; pauseMs: number; format: string }) => Promise<EngineSynthesisResult>;
  preview?: (body: { text?: string; voice: string; speed: number }) => Promise<EngineSynthesisResult>;
};

function fakeEngine(overrides: EngineOverrides = {}) {
  return {
    url: "http://127.0.0.1:4310",
    health:
      overrides.health ??
      (async () => ({
        status: "ok",
        usable: true,
        engine: { id: "kokoro", label: "Kokoro-82M", installed: true, loaded: true },
        espeak: { available: true, source: "espeakng-loader" },
        ffmpeg: { available: true, path: "ffmpeg" },
        formats: ["wav", "mp3"],
        limits: { maxTextChars: 100_000, chunkChars: 400, minSpeed: 0.5, maxSpeed: 2, maxPauseMs: 2000 }
      })),
    voices: overrides.voices ?? (async () => ({ engine: "kokoro", label: "Kokoro-82M", source: "test", sampleRate: 24000, voices: VOICES })),
    synthesize: overrides.synthesize ?? (async (body) => synthesis({ voice: body.voice, speed: body.speed, pauseMs: body.pauseMs, format: body.format })),
    preview:
      overrides.preview ??
      (async (body) => synthesis({ voice: body.voice, relativePath: "generated-audio/previews/ef_dora-abc12345.wav" }))
  };
}

type PrismaOverrides = { stored?: string | null; fail?: boolean };

function fakePrisma(overrides: PrismaOverrides = {}) {
  const upserts: Array<{ where: { key: string }; value: string }> = [];
  const prisma = {
    appSetting: {
      findUnique: async () => {
        if (overrides.fail) throw new Error("db down");
        return overrides.stored ? { key: "voice.fullpos.default", value: overrides.stored } : null;
      },
      upsert: async (args: { create: { value: string }; update: { value: string }; where: { key: string } }) => {
        if (overrides.fail) throw new Error("db down");
        upserts.push({ where: args.where, value: args.update.value });
        return args;
      }
    }
  };
  return { prisma, upserts };
}

function service(engine: ReturnType<typeof fakeEngine>, prisma: ReturnType<typeof fakePrisma>["prisma"]) {
  return new VoiceService(engine as never, prisma as never);
}

// ------------------------------------------------------------------ health

test("health resume el estado del motor sin lanzar", async () => {
  const report = await service(fakeEngine(), fakePrisma().prisma).health();
  assert.equal(report.ok, true);
  assert.equal(report.engineUrl, "http://127.0.0.1:4310");
  assert.deepEqual(report.formats, ["wav", "mp3"]);
  assert.equal(report.reason, null);
});

test("health explica el motivo cuando el motor esta apagado", async () => {
  const engine = fakeEngine({
    health: async () => {
      throw new VoiceEngineUnavailableError("No se pudo contactar el motor de voz.");
    }
  });
  const report = await service(engine, fakePrisma().prisma).health();
  assert.equal(report.ok, false);
  assert.match(String(report.reason), /No se pudo contactar/);
  assert.equal(report.engine, null);
});

// ----------------------------------------------------------------- falsos

test("voces: se listan y se resuelve la voz FullPOS guardada", async () => {
  const { prisma } = fakePrisma({ stored: JSON.stringify({ voiceId: "em_alex", voiceName: "Alex" }) });
  const report = await service(fakeEngine(), prisma).voices();
  assert.deepEqual(report.voices.map((voice) => voice.id), ["ef_dora", "em_alex"]);
  assert.equal(report.defaultVoiceId, "em_alex");
});

test("voces: motor apagado devuelve 503 con mensaje claro", async () => {
  const engine = fakeEngine({
    voices: async () => {
      throw new VoiceEngineUnavailableError("Motor apagado: arrancalo con npm run voice:dev");
    }
  });
  await assert.rejects(
    () => service(engine, fakePrisma().prisma).voices(),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match(error.message, /voice:dev/);
      return true;
    }
  );
});

// ------------------------------------------------------------- generacion

test("generate devuelve URLs firmables y el nombre de la voz", async () => {
  const generation = await service(fakeEngine(), fakePrisma().prisma).generate({
    text: "Bienvenido a FullPOS Cloud.",
    voice: "ef_dora",
    speed: 1,
    pauseMs: 300,
    format: "wav"
  });
  assert.equal(generation.audioUrl, "/voice/files/2026-09-22/ef_dora-abc12345.wav");
  assert.equal(generation.downloadUrl, "/voice/files/2026-09-22/ef_dora-abc12345.wav?download=1");
  assert.equal(generation.voiceName, "Dora");
  assert.equal(generation.chunks, 1);
  assert.equal(generation.format, "wav");
  assert.equal(generation.masterUrl, null);
});

test("generate expone el WAV maestro cuando el formato es MP3", async () => {
  const engine = fakeEngine({
    synthesize: async () =>
      synthesis({
        fileName: "ef_dora-abc12345.mp3",
        relativePath: "generated-audio/2026-09-22/ef_dora-abc12345.mp3",
        masterRelativePath: "generated-audio/2026-09-22/ef_dora-abc12345.wav",
        format: "mp3"
      })
  });
  const generation = await service(engine, fakePrisma().prisma).generate({
    text: "Hola.",
    voice: "ef_dora",
    format: "mp3"
  });
  assert.equal(generation.masterUrl, "/voice/files/2026-09-22/ef_dora-abc12345.wav");
  assert.equal(generation.format, "mp3");
});

test("generate aplica valores por defecto razonables", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const engine = fakeEngine({
    synthesize: async (body) => {
      captured.push(body);
      return synthesis({ voice: body.voice });
    }
  });
  await service(engine, fakePrisma().prisma).generate({ text: "Hola.", voice: "ef_dora" });
  assert.deepEqual(captured[0], { text: "Hola.", voice: "ef_dora", speed: 1, pauseMs: 300, format: "wav" });
});

test("payload invalido no llega al motor", async () => {
  let called = false;
  const engine = fakeEngine({
    synthesize: async () => {
      called = true;
      return synthesis();
    }
  });
  const target = service(engine, fakePrisma().prisma);

  await assert.rejects(() => target.generate({ voice: "ef_dora" }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "   ", voice: "ef_dora" }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "DORA" }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", speed: 9 }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", speed: "1.0" }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", pauseMs: -5 }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", pauseMs: 1.5 }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", format: "ogg" }), BadRequestException);
  assert.equal(called, false, "el motor no debe arrancar con un payload invalido");
});

test("texto gigante se rechaza antes de tocar el motor", async () => {
  await assert.rejects(
    () => service(fakeEngine(), fakePrisma().prisma).generate({ text: "a".repeat(100_001), voice: "ef_dora" }),
    BadRequestException
  );
});

test("el rechazo del motor se traduce a HTTP sin trazas", async () => {
  const engine = fakeEngine({
    synthesize: async () => {
      throw new VoiceEngineRequestError("El guion tiene 200000 caracteres.", "text_too_long", 413);
    }
  });
  await assert.rejects(
    () => service(engine, fakePrisma().prisma).generate({ text: "Hola.", voice: "ef_dora" }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.doesNotMatch(error.message, /Traceback|site-packages/);
      return true;
    }
  );
});

test("un motor caido durante la generacion devuelve 503", async () => {
  const engine = fakeEngine({
    synthesize: async () => {
      throw new VoiceEngineUnavailableError("El motor de voz no respondio en 900 s.");
    }
  });
  await assert.rejects(
    () => service(engine, fakePrisma().prisma).generate({ text: "Hola.", voice: "ef_dora" }),
    ServiceUnavailableException
  );
});

test("un audio guardado fuera de storage/generated-audio se rechaza", async () => {
  const engine = fakeEngine({
    synthesize: async () => synthesis({ relativePath: "D:/otro/sitio/ef_dora-abc12345.wav" })
  });
  await assert.rejects(
    () => service(engine, fakePrisma().prisma).generate({ text: "Hola.", voice: "ef_dora" }),
    ServiceUnavailableException
  );
});

test("preview respeta la voz pedida y guarda en previews", async () => {
  const generation = await service(fakeEngine(), fakePrisma().prisma).preview({ voice: "em_alex", speed: 1 });
  assert.equal(generation.audioUrl, "/voice/files/previews/ef_dora-abc12345.wav");
  assert.equal(generation.voice, "em_alex");
  assert.equal(generation.voiceName, "Alex");
});

// ------------------------------------------------------- archivos servidos

const probeFolder = "unit-test-probe";
const probeFile = "ef_dora-abc12345.wav";

test("resolveAudioFile valida rutas y sirve solo dentro de generated-audio", () => {
  const service_ = service(fakeEngine(), fakePrisma().prisma);
  const directory = path.join(generatedAudioRoot, probeFolder);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, probeFile), Buffer.from("RIFF0000WAVE"));
  try {
    const resolved = service_.resolveAudioFile(probeFolder, probeFile);
    assert.equal(resolved.path, path.join(directory, probeFile));
    assert.equal(resolved.contentType, "audio/wav");
    assert.ok(existsSync(resolved.path));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  assert.throws(() => service_.resolveAudioFile(probeFolder, "..%2f..%2fsecret.txt"), BadRequestException);
  assert.throws(() => service_.resolveAudioFile(probeFolder, "../../apps/api/.env"), BadRequestException);
  assert.throws(() => service_.resolveAudioFile("..", "ef_dora-abc12345.wav"), BadRequestException);
  assert.throws(() => service_.resolveAudioFile(probeFolder, "..%5c..%5cpackage.json"), BadRequestException);
  assert.throws(() => service_.resolveAudioFile(probeFolder, "notas.txt"), BadRequestException);
  assert.throws(() => service_.resolveAudioFile(probeFolder, "ef_dora-abc12345.mp3"), NotFoundException);
});

// ------------------------------------------------------- voz FullPOS

test("la voz FullPOS se guarda en la clave propia del estudio", async () => {
  const { prisma, upserts } = fakePrisma();
  const preference = await service(fakeEngine(), prisma).savePreference({
    voiceId: "em_alex",
    voiceName: "Alex",
    defaultSpeed: 1.1,
    defaultPauseMs: 250
  });
  assert.equal(preference.persisted, true);
  assert.equal(preference.voiceId, "em_alex");
  assert.equal(preference.defaultSpeed, 1.1);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].where.key, "voice.fullpos.default");
  assert.match(upserts[0].value, /em_alex/);
});

test("la preferencia leida se normaliza al motor actual", async () => {
  const { prisma } = fakePrisma({ stored: JSON.stringify({ engine: "otro", voiceId: "em_alex", defaultSpeed: 0.95 }) });
  const preference = await service(fakeEngine(), prisma).getPreference();
  assert.equal(preference.engine, "kokoro");
  assert.equal(preference.voiceId, "em_alex");
  assert.equal(preference.persisted, true);
});

test("si la base de datos no responde la pagina sigue viva", async () => {
  const { prisma } = fakePrisma({ fail: true });
  const preference = await service(fakeEngine(), prisma).getPreference();
  assert.equal(preference.persisted, false);
  assert.equal(preference.voiceId, "ef_dora");
});

test("guardar la voz FullPOS con la base caida falla con un mensaje entendible", async () => {
  const { prisma } = fakePrisma({ fail: true });
  await assert.rejects(
    () => service(fakeEngine(), prisma).savePreference({ voiceId: "em_alex" }),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match(error.message, /base de datos/);
      return true;
    }
  );
});
