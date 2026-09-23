import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { generatedAudioRoot } from "../lib/paths.js";
import { VoiceEngineRequestError, VoiceEngineUnavailableError, type EngineSynthesisResult } from "./voice-engine.client.js";
import { VoiceService } from "./voice.service.js";

const VOICES = [
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
  }
];

const ENGINE_GROUPS = [
  {
    id: "kokoro",
    label: "Kokoro-82M (local)",
    source: "huggingface",
    sampleRate: 24000,
    installed: true,
    reason: null,
    voices: [VOICES[0], VOICES[1]]
  },
  {
    id: "piper",
    label: "Piper (local)",
    source: null,
    sampleRate: 22050,
    installed: true,
    reason: null,
    voices: [VOICES[2]]
  }
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
    voices: overrides.voices ?? (async () => ({ engine: "kokoro", label: "Kokoro-82M", source: "test", sampleRate: 24000, engines: ENGINE_GROUPS, voices: VOICES })),
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
  assert.deepEqual(report.voices.map((voice) => voice.id), ["ef_dora", "em_alex", "es_MX-ald-medium"]);
  assert.equal(report.defaultVoiceId, "em_alex");
  assert.equal(report.defaultEngine, "kokoro");
});

test("voces: los motores llegan agrupados con su metadata verificada", async () => {
  const report = await service(fakeEngine(), fakePrisma().prisma).voices();
  assert.deepEqual(report.engines.map((group) => group.id), ["kokoro", "piper"]);
  const piper = report.engines[1];
  assert.equal(piper.installed, true);
  assert.equal(piper.sampleRate, 22050);
  const ald = piper.voices[0];
  assert.equal(ald.key, "piper:es_MX-ald-medium");
  assert.equal(ald.locale, "es_MX");
  assert.equal(ald.region, "Mexico");
  assert.equal(ald.quality, "medium");
  // El genero no esta verificado en el model card: debe llegar como null, no inventado.
  assert.equal(ald.gender, null);
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
  assert.equal(generation.voiceKey, "kokoro:ef_dora");
  assert.equal(generation.chunks, 1);
  assert.equal(generation.format, "wav");
  assert.equal(generation.masterUrl, null);
  // Ubicacion para la interfaz: relativa, nunca absoluta.
  assert.equal(generation.folder, "2026-09-22");
  assert.equal(generation.savedIn, "storage/generated-audio/2026-09-22");
});

test("el motor elegido se reenvia al voice-engine", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const engine = fakeEngine({
    synthesize: async (body) => {
      captured.push(body);
      return synthesis({ voice: body.voice, engine: "piper" });
    }
  });
  const generation = await service(engine, fakePrisma().prisma).generate({
    text: "Bienvenido a FullPOS Cloud.",
    voice: "es_MX-ald-medium",
    engine: "piper",
    speed: 1,
    pauseMs: 300,
    format: "wav"
  });
  assert.equal(captured[0].engine, "piper");
  assert.equal(captured[0].voice, "es_MX-ald-medium");
  assert.equal(generation.engine, "piper");
  assert.equal(generation.voiceKey, "piper:es_MX-ald-medium");
  assert.equal(generation.voiceName, "Ald");
});

test("preview tambien reenvia el motor", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const engine = fakeEngine({
    preview: async (body) => {
      captured.push(body);
      return synthesis({ voice: body.voice, relativePath: "generated-audio/previews/ef_dora-abc12345.wav" });
    }
  });
  await service(engine, fakePrisma().prisma).preview({ voice: "es_MX-ald-medium", engine: "piper", speed: 1 });
  assert.equal(captured[0].engine, "piper");
});

test("un motor con formato invalido no llega al voice-engine", async () => {
  let called = false;
  const engine = fakeEngine({
    synthesize: async () => {
      called = true;
      return synthesis();
    }
  });
  const target = service(engine, fakePrisma().prisma);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", engine: "piper/../kokoro" }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", engine: 7 }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "ef_dora", engine: "PIPER " + "x".repeat(40) }), BadRequestException);
  assert.equal(called, false);
});

test("el nombre del motor se normaliza (PIPER -> piper)", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const engine = fakeEngine({
    synthesize: async (body) => {
      captured.push(body);
      return synthesis({ voice: body.voice, engine: "piper" });
    }
  });
  await service(engine, fakePrisma().prisma).generate({ text: "Hola.", voice: "es_MX-ald-medium", engine: "PIPER" });
  assert.equal(captured[0].engine, "piper");
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
  assert.deepEqual(captured[0], { text: "Hola.", voice: "ef_dora", speed: 1, pauseMs: 300, format: "wav", engine: "" });
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
  // El id de voz es amplio (es_AR-daniela-high), pero nunca puede ser una ruta.
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "../../etc/passwd" }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "voz con espacios" }), BadRequestException);
  await assert.rejects(() => target.generate({ text: "Hola.", voice: "es_AR/daniela" }), BadRequestException);
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

// ------------------------------------------------------- abrir carpeta

function spyService() {
  const target = service(fakeEngine(), fakePrisma().prisma);
  const opened: string[] = [];
  target.setFolderLauncher((directory) => {
    opened.push(directory);
    return { launched: true, platform: "win32" };
  });
  return { target, opened };
}

const probeDateFolder = "2099-12-31";

test("abrir carpeta sin argumentos abre la raiz de audios generados", async () => {
  const { target, opened } = spyService();
  const result = await target.openGeneratedAudioFolder({});
  assert.deepEqual(result, { opened: true, folder: null, savedIn: "storage/generated-audio" });
  assert.deepEqual(opened, [generatedAudioRoot]);
});

test("abrir carpeta de un dia concreto resuelve la ruta dentro de generated-audio", async () => {
  const { target, opened } = spyService();
  const directory = path.join(generatedAudioRoot, probeDateFolder);
  mkdirSync(directory, { recursive: true });
  try {
    const result = await target.openGeneratedAudioFolder({ folder: probeDateFolder });
    assert.equal(result.folder, probeDateFolder);
    assert.equal(result.savedIn, `storage/generated-audio/${probeDateFolder}`);
    assert.deepEqual(opened, [directory]);
    assert.ok(opened[0].startsWith(generatedAudioRoot));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("una ruta arbitraria se rechaza ANTES de lanzar ningun proceso", async () => {
  const { target, opened } = spyService();
  const attacks = ["../../../Windows", "..\\..\\Windows", "C:\\Windows\\System32", "/etc/passwd", "previews/../.."];
  for (const folder of attacks) {
    await assert.rejects(
      () => target.openGeneratedAudioFolder({ folder }),
      BadRequestException,
      `deberia rechazar ${folder}`
    );
  }
  assert.deepEqual(opened, [], "no se puede abrir nada con una ruta del navegador");
});

test("una carpeta inexistente no lanza el explorador", async () => {
  const { target, opened } = spyService();
  await assert.rejects(() => target.openGeneratedAudioFolder({ folder: "1999-01-01" }), NotFoundException);
  assert.deepEqual(opened, []);
});

test("si el sistema no puede abrir el explorador se informa con 503", async () => {
  const target = service(fakeEngine(), fakePrisma().prisma);
  target.setFolderLauncher(() => ({ launched: false, platform: "linux", reason: "Solo Windows." }));
  await assert.rejects(
    () => target.openGeneratedAudioFolder({}),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match(error.message, /Solo Windows/);
      return true;
    }
  );
});

// ------------------------------------------------------- voz FullPOS

test("la voz FullPOS se guarda en la clave propia del estudio", async () => {
  const { prisma, upserts } = fakePrisma();
  const preference = await service(fakeEngine(), prisma).savePreference({
    engine: "piper",
    voiceId: "es_MX-ald-medium",
    voiceName: "Ald",
    locale: "es_MX",
    defaultSpeed: 1.1,
    defaultPauseMs: 250
  });
  assert.equal(preference.persisted, true);
  assert.equal(preference.engine, "piper");
  assert.equal(preference.voiceId, "es_MX-ald-medium");
  assert.equal(preference.locale, "es_MX");
  assert.equal(preference.defaultSpeed, 1.1);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].where.key, "voice.fullpos.default");
  assert.match(upserts[0].value, /es_MX-ald-medium/);
});

test("una voz Piper de la Fase 2 tiene un id valido para el API", async () => {
  const generation = await service(fakeEngine(), fakePrisma().prisma).generate({
    text: "Hola.",
    voice: "es_AR-daniela-high",
    engine: "piper"
  });
  // El id con guiones y mayusculas (es_AR-daniela-high) pasa la validacion del API.
  assert.equal(generation.voice, "es_AR-daniela-high");
  assert.equal(generation.voiceKey.endsWith(":es_AR-daniela-high"), true);
});

test("la preferencia guardada conserva el motor elegido", async () => {
  const { prisma } = fakePrisma({
    stored: JSON.stringify({ engine: "piper", voiceId: "es_MX-ald-medium", locale: "es_MX", defaultSpeed: 0.95 })
  });
  const preference = await service(fakeEngine(), prisma).getPreference();
  assert.equal(preference.engine, "piper");
  assert.equal(preference.voiceId, "es_MX-ald-medium");
  assert.equal(preference.locale, "es_MX");
  assert.equal(preference.persisted, true);
});

test("una preferencia vieja (sin motor) cae en Kokoro", async () => {
  const { prisma } = fakePrisma({ stored: JSON.stringify({ voiceId: "em_alex", defaultSpeed: 0.95 }) });
  const preference = await service(fakeEngine(), prisma).getPreference();
  assert.equal(preference.engine, "kokoro");
  assert.equal(preference.voiceId, "em_alex");
  assert.equal(preference.persisted, true);
});

test("una preferencia corrupta se ignora sin romper", async () => {
  const { prisma } = fakePrisma({ stored: JSON.stringify({ engine: "piper/../etc", voiceId: 7 }) });
  const preference = await service(fakeEngine(), prisma).getPreference();
  assert.equal(preference.engine, "kokoro");
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
