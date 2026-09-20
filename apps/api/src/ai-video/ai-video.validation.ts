import { BadRequestException } from "@nestjs/common";
import { getAiScene, getAiVideoProfile, MAX_AI_DURATION_SECONDS, type AiMotionStyle, type AiVideoProfileId, type AiVideoSceneId } from "./ai-video.profiles.js";

export interface AiVideoRequestInput {
  scene: AiVideoSceneId;
  profile: AiVideoProfileId;
  duration: 5;
  motion: AiMotionStyle;
  prompt: string;
  seed?: number;
  confirmCost?: boolean;
}

export function validateAiVideoRequest(body: Record<string, unknown>): AiVideoRequestInput {
  const sceneId = cleanString(body.scene, "scene") as AiVideoSceneId;
  const profileId = cleanString(body.profile, "profile") as AiVideoProfileId;
  getAiScene(sceneId);
  getAiVideoProfile(profileId);

  const duration = body.duration === undefined ? MAX_AI_DURATION_SECONDS : Number(body.duration);
  if (duration !== MAX_AI_DURATION_SECONDS) {
    throw new BadRequestException("La duración IA está limitada a 5 segundos.");
  }

  const motion = (body.motion ?? "elegant") as AiMotionStyle;
  if (!["elegant", "cinematic", "dynamic"].includes(motion)) {
    throw new BadRequestException("Movimiento IA no soportado.");
  }

  const prompt = cleanString(body.prompt, "prompt", false, 1200) ?? "";
  const seed = body.seed === undefined || body.seed === null || body.seed === "" ? undefined : Number(body.seed);
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0)) {
    throw new BadRequestException("seed debe ser un entero positivo.");
  }

  return {
    scene: sceneId,
    profile: profileId,
    duration: MAX_AI_DURATION_SECONDS,
    motion,
    prompt,
    seed,
    confirmCost: body.confirmCost === true
  };
}

export function validateCostConfirmation(confirmed: boolean) {
  if (!confirmed) {
    throw new BadRequestException("Confirma el costo antes de generar con IA.");
  }
}

function cleanString(value: unknown, field: string, required = true, maxLength = 240) {
  if (value === undefined || value === null || value === "") {
    if (!required) return undefined;
    throw new BadRequestException(`${field} es obligatorio.`);
  }
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} debe ser texto.`);
  }
  const trimmed = value.trim();
  if (!trimmed && required) throw new BadRequestException(`${field} es obligatorio.`);
  if (trimmed.length > maxLength) throw new BadRequestException(`${field} es demasiado largo.`);
  return trimmed;
}

