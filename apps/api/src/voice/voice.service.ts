import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { existsSync } from "node:fs";
import path from "node:path";
import { assertInside, generatedAudioRoot } from "../lib/paths.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { openInExplorer, resolveGeneratedAudioFolder, type OpenResult } from "./open-folder.js";
import { VoiceEngineClient, VoiceEngineError, type EngineSynthesisResult, type EngineVoiceList } from "./voice-engine.client.js";
import type {
  VoiceGeneration,
  VoiceGenerationRequest,
  VoiceHealthReport,
  VoiceOpenFolderResult,
  VoiceOption,
  VoicePreference
} from "./voice.types.js";

const PREFERENCE_KEY = "voice.fullpos.default";
const ENGINE_ID = "kokoro";

/* Limites espejo de voice-engine/config.py. Se repiten aqui para no depender de un
 * viaje al motor al validar, y para que un payload invalido no llegue siquiera a
 * arrancar el modelo. */
const MAX_TEXT_CHARS = 100_000;
const MIN_SPEED = 0.5;
const MAX_SPEED = 2;
const MAX_PAUSE_MS = 2_000;
const DEFAULT_SPEED = 1;
const DEFAULT_PAUSE_MS = 300;

const VOICE_ID_PATTERN = /^[a-z]{2}_[a-z0-9_]{1,32}$/;
const FOLDER_PATTERN = /^[a-z0-9-]{1,32}$/;
const FILE_PATTERN = /^[A-Za-z0-9._-]{1,120}\.(wav|mp3)$/;
const VOICES_CACHE_MS = 60_000;

const DEFAULT_PREFERENCE: Omit<VoicePreference, "persisted"> = {
  engine: ENGINE_ID,
  voiceId: "ef_dora",
  voiceName: "Dora",
  language: "es",
  defaultSpeed: DEFAULT_SPEED,
  defaultPauseMs: DEFAULT_PAUSE_MS,
  updatedAt: new Date(0).toISOString()
};

@Injectable()
export class VoiceService {
  private voicesCache: { at: number; data: EngineVoiceList } | null = null;
  /** Abrir la carpeta lanza un proceso: se deja sustituible para las pruebas. */
  private launcher: (directory: string) => OpenResult = openInExplorer;

  constructor(
    @Inject(VoiceEngineClient) private readonly engine: VoiceEngineClient,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  /** Solo para pruebas: observa que carpeta se habria abierto. */
  setFolderLauncher(launcher: (directory: string) => OpenResult) {
    this.launcher = launcher;
  }

  get engineUrl() {
    return this.engine.url;
  }

  /** Nunca lanza: la pagina debe poder explicar por que el motor no esta listo. */
  async health(): Promise<VoiceHealthReport> {
    try {
      const health = await this.engine.health();
      return {
        ok: Boolean(health.usable),
        engineUrl: this.engine.url,
        reason: health.reason ?? null,
        engine: health.engine ?? null,
        espeak: health.espeak ?? null,
        ffmpeg: { available: Boolean(health.ffmpeg?.available) },
        formats: Array.isArray(health.formats) ? health.formats : ["wav"],
        limits: health.limits ?? null
      };
    } catch (error) {
      return {
        ok: false,
        engineUrl: this.engine.url,
        reason: describe(error),
        engine: null,
        espeak: null,
        ffmpeg: null,
        formats: [],
        limits: null
      };
    }
  }

  async voices(): Promise<{ engine: string; label: string; source: string | null; voices: VoiceOption[]; defaultVoiceId: string }> {
    const list = await this.loadVoices();
    const preference = await this.getPreference();
    return {
      engine: list.engine,
      label: list.label,
      source: list.source ?? null,
      voices: list.voices,
      defaultVoiceId: preference.voiceId
    };
  }

  async preview(body: Record<string, unknown>): Promise<VoiceGeneration> {
    const voice = this.readVoice(body.voice);
    const speed = this.readSpeed(body.speed);
    const text = typeof body.text === "string" ? body.text.slice(0, 320) : "";
    try {
      const result = await this.engine.preview({ text, voice, speed });
      return await this.toGeneration(result);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async generate(body: Record<string, unknown>): Promise<VoiceGeneration> {
    const request = this.readGenerationRequest(body);
    try {
      const result = await this.engine.synthesize(request);
      return await this.toGeneration(result);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** Resuelve un archivo generado con validacion estricta (sin path traversal). */
  resolveAudioFile(folder: string, name: string) {
    if (!FOLDER_PATTERN.test(folder) || !FILE_PATTERN.test(name)) {
      throw new BadRequestException("Nombre de archivo no valido.");
    }
    const target = path.join(generatedAudioRoot, folder, name);
    try {
      assertInside(generatedAudioRoot, target);
    } catch {
      throw new BadRequestException("Ruta fuera de storage/generated-audio.");
    }
    if (!existsSync(target)) {
      throw new NotFoundException("El audio ya no esta disponible en storage/generated-audio.");
    }
    return {
      path: target,
      contentType: name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav",
      downloadName: name
    };
  }

  /**
   * Abre en el explorador de Windows la carpeta de audios generados.
   *
   * El cuerpo solo puede decir QUE carpeta conocida (una fecha o "previews"), nunca
   * una ruta: la resolucion se hace aqui, dentro de storage/generated-audio.
   */
  async openGeneratedAudioFolder(body: Record<string, unknown>): Promise<VoiceOpenFolderResult> {
    const resolution = resolveGeneratedAudioFolder(body?.folder);
    if (!resolution.ok) {
      throw resolution.reason === "invalid"
        ? new BadRequestException(resolution.message)
        : new NotFoundException(resolution.message);
    }
    const opened = this.launcher(resolution.directory);
    if (!opened.launched) {
      throw new ServiceUnavailableException(
        opened.reason ?? "No se pudo abrir la carpeta en el explorador de Windows."
      );
    }
    return { opened: true, folder: resolution.folder, savedIn: resolution.relative };
  }

  async getPreference(): Promise<VoicePreference> {
    try {
      const stored = await this.prisma.appSetting.findUnique({ where: { key: PREFERENCE_KEY } });
      if (!stored) return { ...DEFAULT_PREFERENCE, persisted: false };
      const parsed = JSON.parse(stored.value) as Partial<VoicePreference>;
      return {
        ...DEFAULT_PREFERENCE,
        ...parsed,
        engine: ENGINE_ID,
        persisted: true
      };
    } catch {
      // La voz FullPOS es una comodidad: si la BD no responde, la pagina sigue.
      return { ...DEFAULT_PREFERENCE, persisted: false };
    }
  }

  async savePreference(body: Record<string, unknown>): Promise<VoicePreference> {
    const current = await this.getPreference();
    const next: Omit<VoicePreference, "persisted"> = {
      engine: ENGINE_ID,
      voiceId: typeof body.voiceId === "string" && VOICE_ID_PATTERN.test(body.voiceId.trim()) ? body.voiceId.trim() : current.voiceId,
      voiceName: typeof body.voiceName === "string" && body.voiceName.trim() ? body.voiceName.trim().slice(0, 80) : current.voiceName,
      language: "es",
      defaultSpeed: readNumber(body.defaultSpeed, current.defaultSpeed, MIN_SPEED, MAX_SPEED),
      defaultPauseMs: readInteger(body.defaultPauseMs, current.defaultPauseMs, 0, MAX_PAUSE_MS),
      updatedAt: new Date().toISOString()
    };
    try {
      await this.prisma.appSetting.upsert({
        where: { key: PREFERENCE_KEY },
        create: { key: PREFERENCE_KEY, value: JSON.stringify(next) },
        update: { value: JSON.stringify(next) }
      });
    } catch {
      throw new ServiceUnavailableException(
        "No se pudo guardar la voz FullPOS: la base de datos del estudio no responde."
      );
    }
    return { ...next, persisted: true };
  }

  // ------------------------------------------------------------- internos

  private async loadVoices(): Promise<EngineVoiceList> {
    const now = Date.now();
    if (this.voicesCache && now - this.voicesCache.at < VOICES_CACHE_MS) return this.voicesCache.data;
    try {
      const list = await this.engine.voices();
      this.voicesCache = { at: now, data: list };
      return list;
    } catch (error) {
      throw toHttpError(error);
    }
  }

  private async toGeneration(result: EngineSynthesisResult): Promise<VoiceGeneration> {
    const folder = folderOf(result.relativePath);
    if (!folder) {
      throw new ServiceUnavailableException(
        "El motor guardo el audio fuera de storage/generated-audio; revisa VOICE_OUTPUT_DIR."
      );
    }
    if (!FILE_PATTERN.test(result.fileName)) {
      throw new ServiceUnavailableException("El motor devolvio un nombre de archivo no valido.");
    }

    const audioPath = `/voice/files/${folder}/${result.fileName}`;
    const masterFolder = result.masterRelativePath ? folderOf(result.masterRelativePath) : null;
    const masterName = result.masterRelativePath ? path.basename(result.masterRelativePath) : null;

    return {
      id: result.generationId,
      fileName: result.fileName,
      voice: result.voice,
      voiceName: await this.voiceNameFor(result.voice),
      engine: result.engine,
      format: result.format,
      durationSeconds: result.durationSeconds,
      bytes: result.bytes,
      sampleRate: result.sampleRate,
      speed: result.speed,
      pauseMs: result.pauseMs,
      chunks: Array.isArray(result.chunks) ? result.chunks.length : 1,
      createdAt: result.createdAt,
      textCharacters: result.textCharacters,
      textWords: result.textWords,
      audioUrl: audioPath,
      downloadUrl: `${audioPath}?download=1`,
      masterUrl: masterFolder && masterName ? `/voice/files/${masterFolder}/${masterName}` : null,
      folder,
      savedIn: `storage/generated-audio/${folder}`
    };
  }

  private async voiceNameFor(voiceId: string): Promise<string | null> {
    try {
      const list = await this.loadVoices();
      return list.voices.find((voice) => voice.id === voiceId)?.name ?? null;
    } catch {
      return null;
    }
  }

  private readGenerationRequest(body: Record<string, unknown>): VoiceGenerationRequest {
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      throw new BadRequestException("Escribe o pega el guion antes de generar la narracion.");
    }
    if (text.length > MAX_TEXT_CHARS) {
      throw new BadRequestException(
        `El guion tiene ${text.length} caracteres y el limite local es ${MAX_TEXT_CHARS}. Divide el guion en partes.`
      );
    }
    const format = body.format === undefined || body.format === "" ? "wav" : body.format;
    if (format !== "wav" && format !== "mp3") {
      throw new BadRequestException("Formato no soportado: usa WAV o MP3.");
    }
    return {
      text,
      voice: this.readVoice(body.voice),
      speed: this.readSpeed(body.speed),
      pauseMs: readInteger(body.pauseMs, DEFAULT_PAUSE_MS, 0, MAX_PAUSE_MS, "La pausa debe estar entre 0 y 2000 ms."),
      format
    };
  }

  private readVoice(value: unknown): string {
    const voice = typeof value === "string" ? value.trim() : "";
    if (!VOICE_ID_PATTERN.test(voice)) {
      throw new BadRequestException("Selecciona una voz valida antes de generar.");
    }
    return voice;
  }

  private readSpeed(value: unknown): number {
    return readNumber(value, DEFAULT_SPEED, MIN_SPEED, MAX_SPEED, `La velocidad debe estar entre ${MIN_SPEED} y ${MAX_SPEED}.`);
  }
}

function folderOf(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  const parts = relativePath.replace(/\\/g, "/").split("/");
  // El motor devuelve `generated-audio/<carpeta>/<archivo>`.
  if (parts.length !== 3 || parts[0] !== "generated-audio") return null;
  return FOLDER_PATTERN.test(parts[1]) ? parts[1] : null;
}

function readNumber(value: unknown, fallback: number, min: number, max: number, message?: string): number {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequestException(message ?? "Valor numerico no valido.");
  }
  if (value < min || value > max) {
    throw new BadRequestException(message ?? `El valor debe estar entre ${min} y ${max}.`);
  }
  return value;
}

function readInteger(value: unknown, fallback: number, min: number, max: number, message?: string): number {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new BadRequestException(message ?? "Se esperaba un numero entero.");
  }
  if (value < min || value > max) {
    throw new BadRequestException(message ?? `El valor debe estar entre ${min} y ${max}.`);
  }
  return value;
}

export function toHttpError(error: unknown): Error {
  if (error instanceof VoiceEngineError) {
    if (error.status === 503) return new ServiceUnavailableException(error.message);
    if (error.status === 413) return new BadRequestException(error.message);
    if (error.status === 400) return new BadRequestException(error.message);
    return new ServiceUnavailableException(error.message);
  }
  return new ServiceUnavailableException(describe(error));
}

export function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido del motor de voz.";
}
