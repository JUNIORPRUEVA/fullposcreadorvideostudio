import type { AdFormat, NarrationStyle, TemplateMetadata, VideoType } from "@fullpos-ad-studio/shared";

export const videoTypes: Array<{ id: VideoType; label: string; description: string; defaultFormat: AdFormat; narrationStyle: NarrationStyle; musicEnabled: boolean; aiEnabled: boolean; subtitleMode: "OFF" | "AUTO_FROM_NARRATION" }> = [
  { id: "ADVERTISEMENT", label: "Publicidad", description: "Promociona tu producto o servicio", defaultFormat: "9:16", narrationStyle: "PROMOTIONAL", musicEnabled: true, aiEnabled: true, subtitleMode: "OFF" },
  { id: "QUICK_TUTORIAL", label: "Tutorial rápido", description: "Explica una función en pocos minutos", defaultFormat: "9:16", narrationStyle: "QUICK_TUTORIAL", musicEnabled: false, aiEnabled: false, subtitleMode: "AUTO_FROM_NARRATION" },
  { id: "COURSE", label: "Curso / Capacitación", description: "Capacita usuarios paso a paso", defaultFormat: "16:9", narrationStyle: "TRAINING", musicEnabled: false, aiEnabled: false, subtitleMode: "AUTO_FROM_NARRATION" },
  { id: "ONBOARDING", label: "Onboarding", description: "Enseña cómo comenzar", defaultFormat: "16:9", narrationStyle: "TRAINING", musicEnabled: false, aiEnabled: false, subtitleMode: "AUTO_FROM_NARRATION" },
  { id: "FEATURE_SPOTLIGHT", label: "Mostrar una función", description: "Presenta una herramienta específica", defaultFormat: "16:9", narrationStyle: "CORPORATE", musicEnabled: true, aiEnabled: true, subtitleMode: "AUTO_FROM_NARRATION" },
  { id: "SUPPORT", label: "Soporte", description: "Explica cómo resolver un problema", defaultFormat: "16:9", narrationStyle: "QUICK_TUTORIAL", musicEnabled: false, aiEnabled: false, subtitleMode: "AUTO_FROM_NARRATION" },
  { id: "BRAND_MOTIVATIONAL", label: "Marca / Motivación", description: "Contenido institucional o inspirador", defaultFormat: "9:16", narrationStyle: "MOTIVATIONAL", musicEnabled: true, aiEnabled: true, subtitleMode: "AUTO_FROM_NARRATION" },
  { id: "FREEFORM", label: "Video libre", description: "Construye tu video desde cero", defaultFormat: "16:9", narrationStyle: "CORPORATE", musicEnabled: false, aiEnabled: false, subtitleMode: "OFF" }
];

export const templateCatalog: TemplateMetadata[] = [
  { id: "saas-premium-ad", name: "SaaS Premium Ad", videoTypes: ["ADVERTISEMENT"], defaultAspectRatio: "9:16", supportedAspectRatios: ["9:16", "1:1", "4:5"], defaultDurationMode: "30_SEC", supportsAi: true, supportsMusic: true, supportsVoice: true, supportsScreenRecording: false, supportsChapters: false },
  { id: "quick-tutorial", name: "Quick Tutorial", videoTypes: ["QUICK_TUTORIAL", "SUPPORT"], defaultAspectRatio: "9:16", supportedAspectRatios: ["9:16", "16:9"], defaultDurationMode: "SCENE_BASED", supportsAi: false, supportsMusic: true, supportsVoice: true, supportsScreenRecording: true, supportsChapters: false },
  { id: "professional-course", name: "Professional Course", videoTypes: ["COURSE", "ONBOARDING"], defaultAspectRatio: "16:9", supportedAspectRatios: ["16:9"], defaultDurationMode: "LONG_FORM", supportsAi: false, supportsMusic: true, supportsVoice: true, supportsScreenRecording: true, supportsChapters: true },
  { id: "feature-spotlight", name: "Feature Spotlight", videoTypes: ["FEATURE_SPOTLIGHT"], defaultAspectRatio: "16:9", supportedAspectRatios: ["16:9", "9:16", "4:5"], defaultDurationMode: "60_SEC", supportsAi: true, supportsMusic: true, supportsVoice: true, supportsScreenRecording: true, supportsChapters: false },
  { id: "customer-onboarding", name: "Customer Onboarding", videoTypes: ["ONBOARDING"], defaultAspectRatio: "16:9", supportedAspectRatios: ["16:9"], defaultDurationMode: "SCENE_BASED", supportsAi: false, supportsMusic: true, supportsVoice: true, supportsScreenRecording: true, supportsChapters: true },
  { id: "visual-support", name: "Visual Support", videoTypes: ["SUPPORT"], defaultAspectRatio: "16:9", supportedAspectRatios: ["16:9"], defaultDurationMode: "SCENE_BASED", supportsAi: false, supportsMusic: false, supportsVoice: true, supportsScreenRecording: true, supportsChapters: false },
  { id: "brand-motivational", name: "Brand Motivational", videoTypes: ["BRAND_MOTIVATIONAL", "FREEFORM"], defaultAspectRatio: "9:16", supportedAspectRatios: ["9:16", "16:9", "1:1", "4:5"], defaultDurationMode: "60_SEC", supportsAi: true, supportsMusic: true, supportsVoice: true, supportsScreenRecording: false, supportsChapters: false }
];

export function policyForVideoType(videoType: string | undefined) {
  return videoTypes.find((item) => item.id === videoType) ?? videoTypes[0];
}

export function defaultTemplateFor(videoType: string | undefined) {
  const type = policyForVideoType(videoType).id;
  return templateCatalog.find((template) => template.videoTypes.includes(type)) ?? templateCatalog[0];
}
