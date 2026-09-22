import { Injectable } from "@nestjs/common";
import type { VoiceEngineHealth, VoiceOption } from "./voice.types.js";

/*
 * Cliente del motor TTS local (voice-engine, FastAPI sobre 127.0.0.1).
 *
 * El navegador NUNCA habla con el motor: este cliente es la frontera. Aqui se
 * normalizan los fallos (motor apagado, timeout, respuesta corrupta) para que la
 * interfaz reciba un mensaje claro y nunca una traza.
 */

export class VoiceEngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "VoiceEngineError";
  }
}

/** El motor no responde (apagado, puerto cerrado, timeout). */
export class VoiceEngineUnavailableError extends VoiceEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "engine_unavailable", 503, cause);
    this.name = "VoiceEngineUnavailableError";
  }
}

/** El motor respondio, pero rechazo la peticion. */
export class VoiceEngineRequestError extends VoiceEngineError {
  constructor(message: string, code: string, status: number) {
    super(message, code, status);
    this.name = "VoiceEngineRequestError";
  }
}

export type EngineSynthesisResult = {
  generationId: string;
  fileName: string;
  relativePath: string;
  masterRelativePath: string | null;
  format: string;
  durationSeconds: number;
  bytes: number;
  sampleRate: number;
  voice: string;
  speed: number;
  pauseMs: number;
  engine: string;
  createdAt: string;
  textCharacters: number;
  textWords: number;
  chunks: Array<{ index: number; characters: number; pauseMs: number; elapsedSeconds: number }>;
};

export type EngineVoiceList = {
  engine: string;
  label: string;
  source?: string;
  sampleRate: number;
  voices: VoiceOption[];
};

const HEALTH_TIMEOUT_MS = Number(process.env.VOICE_ENGINE_HEALTH_TIMEOUT_MS ?? 5_000);
// Narrar un guion largo en CPU lleva minutos: el timeout de sintesis es amplio.
const SYNTHESIS_TIMEOUT_MS = Number(process.env.VOICE_ENGINE_TIMEOUT_MS ?? 900_000);

@Injectable()
export class VoiceEngineClient {
  private readonly baseUrl = (process.env.VOICE_ENGINE_URL ?? "http://127.0.0.1:4310").replace(/\/+$/, "");
  private readonly token = (process.env.VOICE_ENGINE_TOKEN ?? "").trim();

  get url() {
    return this.baseUrl;
  }

  health(): Promise<VoiceEngineHealth> {
    return this.request<VoiceEngineHealth>("GET", "/health", undefined, HEALTH_TIMEOUT_MS);
  }

  voices(): Promise<EngineVoiceList> {
    return this.request<EngineVoiceList>("GET", "/voices", undefined, HEALTH_TIMEOUT_MS);
  }

  synthesize(body: {
    text: string;
    voice: string;
    speed: number;
    pauseMs: number;
    format: string;
  }): Promise<EngineSynthesisResult> {
    return this.request<EngineSynthesisResult>("POST", "/synthesize", body, SYNTHESIS_TIMEOUT_MS);
  }

  preview(body: { text?: string; voice: string; speed: number }): Promise<EngineSynthesisResult> {
    return this.request<EngineSynthesisResult>("POST", "/preview", body, SYNTHESIS_TIMEOUT_MS);
  }

  private async request<T>(method: "GET" | "POST", path: string, body: unknown, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(this.token ? { "x-voice-token": this.token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const raw = await response.text();
      const payload = parseJson(raw);
      if (payload === INVALID_JSON) {
        throw new VoiceEngineUnavailableError(
          `El motor de voz devolvio una respuesta ilegible (HTTP ${response.status}).`
        );
      }

      if (!response.ok) {
        const error = (payload as { error?: { code?: string; message?: string } })?.error;
        throw new VoiceEngineRequestError(
          typeof error?.message === "string" && error.message.trim()
            ? error.message
            : `El motor de voz rechazo la peticion (HTTP ${response.status}).`,
          typeof error?.code === "string" ? error.code : "engine_error",
          response.status
        );
      }
      return payload as T;
    } catch (error) {
      if (error instanceof VoiceEngineError) throw error;
      if (isAbortError(error)) {
        throw new VoiceEngineUnavailableError(
          `El motor de voz no respondio en ${Math.round(timeoutMs / 1000)} s. Revisa que siga activo (npm run voice:dev).`,
          error
        );
      }
      throw new VoiceEngineUnavailableError(
        `No se pudo contactar el motor de voz en ${this.baseUrl}. Arrancalo con "npm run voice:dev" o ejecuta "npm run voice:setup".`,
        error
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

const INVALID_JSON = Symbol("invalid-json");

function parseJson(raw: string): unknown {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return INVALID_JSON;
  }
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}
