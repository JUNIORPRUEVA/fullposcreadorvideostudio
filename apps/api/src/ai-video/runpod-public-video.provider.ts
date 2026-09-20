import { Injectable } from "@nestjs/common";
import { motionToShotType, type AiMotionStyle, type AiVideoProfile } from "./ai-video.profiles.js";
import { readRunpodApiKey } from "./runpod-env.js";

export interface GenerateImageToVideoInput {
  imageUrl: string;
  prompt: string;
  profile: AiVideoProfile;
  duration: 5;
  motion: AiMotionStyle;
  seed?: number;
}

export interface AiVideoGenerationResult {
  provider: "runpod-public";
  model: string;
  status: string;
  runpodJobId?: string;
  videoUrl?: string;
  cost?: number;
  duration: number;
  resolution: string;
}

export interface AiVideoProvider {
  generateImageToVideo(input: GenerateImageToVideoInput): Promise<AiVideoGenerationResult>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json" | "text">>;

@Injectable()
export class RunpodPublicVideoProvider implements AiVideoProvider {
  constructor(private readonly fetchFn: FetchLike = fetch, private readonly apiKeyReader = readRunpodApiKey) {}

  async generateImageToVideo(input: GenerateImageToVideoInput): Promise<AiVideoGenerationResult> {
    const apiKey = this.apiKeyReader();
    if (!apiKey) {
      throw new Error("RUNPOD_API_KEY no está configurada en apps/api/.env.");
    }
    if (!isPublicUrl(input.imageUrl)) {
      throw new Error("La imagen IA debe ser una URL pública descargable.");
    }

    const response = await this.fetchFn(input.profile.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ input: buildRunpodInput(input) }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      const message = await safeText(response);
      throw new Error(runpodErrorMessage(response.status, message));
    }

    const payload = await response.json();
    return RunpodPublicVideoProvider.parseRunpodResponse(payload, input.profile);
  }

  static parseRunpodResponse(payload: unknown, profile: AiVideoProfile): AiVideoGenerationResult {
    if (!payload || typeof payload !== "object") {
      throw new Error("Respuesta inválida de RunPod.");
    }
    const data = payload as { id?: string; status?: string; error?: string; output?: { video_url?: string; cost?: number | string } };
    if (data.status === "FAILED") {
      throw new Error(data.error || "RunPod marcó el job como FAILED.");
    }
    const videoUrl = data.output?.video_url;
    if ((!videoUrl || typeof videoUrl !== "string") && isCompletedStatus(data.status)) {
      throw new Error("RunPod no devolvió output.video_url.");
    }
    const cost = data.output?.cost === undefined ? undefined : Number(data.output.cost);
    return {
      provider: "runpod-public",
      model: profile.model,
      status: data.status ?? (videoUrl ? "COMPLETED" : "UNKNOWN"),
      runpodJobId: data.id,
      videoUrl: typeof videoUrl === "string" ? videoUrl : undefined,
      cost: Number.isFinite(cost) ? cost : undefined,
      duration: profile.duration,
      resolution: profile.resolution
    };
  }
}

function isCompletedStatus(status: string | undefined) {
  return status === "COMPLETED" || status === "COMPLETED_WITH_ERRORS";
}

export function buildRunpodInput(input: GenerateImageToVideoInput) {
  if (input.profile.model === "wan-2-2-i2v") {
    return {
      prompt: input.prompt,
      image: input.imageUrl,
      num_inference_steps: 30,
      guidance: 5,
      negative_prompt: "no text generation, no warped screen, no distorted device, no extra objects, no sudden camera movement, no flicker, no morphing UI",
      size: input.profile.requestSize,
      duration: input.duration,
      flow_shift: 5,
      seed: input.seed ?? -1,
      enable_prompt_optimization: false,
      enable_safety_checker: true
    };
  }

  return {
    prompt: input.prompt,
    image: input.imageUrl,
    size: input.profile.requestSize,
    duration: input.duration,
    shot_type: motionToShotType(input.motion),
    seed: input.seed,
    enable_prompt_expansion: true
  };
}

function isPublicUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function safeText(response: Pick<Response, "text">) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function runpodErrorMessage(status: number, message: string) {
  if (status === 401) return "RunPod rechazó la API key.";
  if (status === 402) return "RunPod indica saldo insuficiente o pago requerido.";
  if (status === 400) return `RunPod rechazó la solicitud: ${message || "Bad Request"}`;
  return `RunPod no respondió correctamente (${status}).`;
}
