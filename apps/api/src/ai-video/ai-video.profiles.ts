export const AI_VIDEO_PROVIDER = "runpod-public";
export const MAX_AI_DURATION_SECONDS = 5;
export const MAX_AI_SCENES_PER_PROJECT = 3;

export type AiVideoProfileId = "preview" | "premium" | "premium-1080p";
export type AiVideoSceneId = "desktop-hero" | "mobile-hero" | "multi-device-hero";
export type AiMotionStyle = "elegant" | "cinematic" | "dynamic";

export interface AiVideoProfile {
  id: AiVideoProfileId;
  label: string;
  model: "wan-2-2-i2v" | "wan-2-6-i2v";
  endpoint: string;
  resolution: "1280x720" | "1920x1080";
  requestSize: "1280*720" | "1280x720" | "1920x1080";
  duration: 5;
  estimatedCost: number;
  requiresExplicit1080p?: boolean;
}

export const aiVideoProfiles: Record<AiVideoProfileId, AiVideoProfile> = {
  preview: {
    id: "preview",
    label: "Preview IA WAN2.2 720p",
    model: "wan-2-2-i2v",
    endpoint: "https://api.runpod.ai/v2/wan-2-2-i2v-720/runsync",
    resolution: "1280x720",
    requestSize: "1280*720",
    duration: 5,
    estimatedCost: 0.3
  },
  premium: {
    id: "premium",
    label: "Premium WAN2.6 720p",
    model: "wan-2-6-i2v",
    endpoint: "https://api.runpod.ai/v2/wan-2-6-i2v/runsync",
    resolution: "1280x720",
    requestSize: "1280x720",
    duration: 5,
    estimatedCost: 0.5
  },
  "premium-1080p": {
    id: "premium-1080p",
    label: "Premium WAN2.6 1080p",
    model: "wan-2-6-i2v",
    endpoint: "https://api.runpod.ai/v2/wan-2-6-i2v/runsync",
    resolution: "1920x1080",
    requestSize: "1920x1080",
    duration: 5,
    estimatedCost: 0.75,
    requiresExplicit1080p: true
  }
};

export const aiSceneTemplates: Record<AiVideoSceneId, { label: string; assetType: "billing" | "mobile"; prompt: string }> = {
  "desktop-hero": {
    label: "Desktop Hero",
    assetType: "billing",
    prompt: "Premium SaaS product hero shot of a desktop dashboard, clean corporate blue and white technology look, subtle camera push-in, readable screen, elegant reflections, no invented text."
  },
  "mobile-hero": {
    label: "Mobile Hero",
    assetType: "mobile",
    prompt: "Premium mobile app hero shot, clean blue and white SaaS interface, smooth cinematic motion, phone screen readable, professional Instagram ad lighting, no invented text."
  },
  "multi-device-hero": {
    label: "Multi-device Hero",
    assetType: "billing",
    prompt: "Premium multi-device SaaS composition with desktop and mobile product screens, clean corporate blue and white technology look, elegant parallax, screens readable, no invented text."
  }
};

export function getAiVideoProfile(id: unknown) {
  if (id !== "preview" && id !== "premium" && id !== "premium-1080p") {
    throw new Error("Perfil IA no soportado.");
  }
  return aiVideoProfiles[id];
}

export function getAiScene(id: unknown) {
  if (id !== "desktop-hero" && id !== "mobile-hero" && id !== "multi-device-hero") {
    throw new Error("Escena IA no soportada.");
  }
  return aiSceneTemplates[id];
}

export function motionToShotType(motion: AiMotionStyle | undefined) {
  if (motion === "dynamic") return "dynamic";
  if (motion === "cinematic") return "cinematic";
  return "smooth";
}
