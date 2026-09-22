/**
 * Contratos del Voice Studio.
 *
 * Se mantienen locales al API (no en `packages/shared`) a proposito: asi la Fase 1
 * queda aislada del motor de video y el cambio es reversible sin tocar el resto.
 */

export type VoiceOption = {
  id: string;
  name: string;
  gender: string;
  language: string;
  engine: string;
  available: boolean;
};

export type VoiceEngineHealth = {
  status: "ok" | "degraded";
  usable: boolean;
  engine: {
    id: string;
    label: string;
    installed: boolean;
    version?: string | null;
    loaded: boolean;
    model?: string;
    device?: string;
    sampleRate?: number;
    voicesSource?: string;
    espeak?: VoiceEspeakStatus;
    reason?: string | null;
  };
  espeak: VoiceEspeakStatus;
  ffmpeg: { available: boolean; path?: string | null };
  formats: string[];
  limits: {
    maxTextChars: number;
    chunkChars: number;
    minSpeed: number;
    maxSpeed: number;
    maxPauseMs: number;
  };
  paths?: { storageRoot?: string; outputRoot?: string };
  reason?: string | null;
  version?: string;
  model?: string;
  device?: string;
};

export type VoiceEspeakStatus = {
  available: boolean;
  source: string;
  library?: string | null;
  data?: string | null;
  reason?: string | null;
};

/** Lo que el navegador recibe tras generar narracion. */
export type VoiceGeneration = {
  id: string;
  fileName: string;
  voice: string;
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
  /** Carpeta del dia donde quedo el archivo (null si el motor la creo fuera). */
  folder: string | null;
  /** Ruta relativa para mostrar en la interfaz (nunca absoluta). */
  savedIn: string;
};

/** Resultado de "Abrir carpeta" (el backend lanza el explorador de Windows). */
export type VoiceOpenFolderResult = {
  opened: boolean;
  folder: string | null;
  savedIn: string;
};

export type VoiceGenerationRequest = {
  text: string;
  voice: string;
  speed: number;
  pauseMs: number;
  format: "wav" | "mp3";
};

export type VoicePreference = {
  engine: string;
  voiceId: string;
  voiceName: string | null;
  language: string;
  defaultSpeed: number;
  defaultPauseMs: number;
  updatedAt: string;
  persisted: boolean;
};

export type VoiceHealthReport = {
  ok: boolean;
  engineUrl: string;
  reason: string | null;
  engine: VoiceEngineHealth["engine"] | null;
  espeak: VoiceEspeakStatus | null;
  ffmpeg: { available: boolean } | null;
  formats: string[];
  limits: VoiceEngineHealth["limits"] | null;
};
