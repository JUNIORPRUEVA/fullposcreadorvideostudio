export const PRODUCT_NAME = "Video Studio";

export * from "./training-engine.js";

export const allowedAssetMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm"
] as const;

export type VideoType =
  | "ADVERTISEMENT"
  | "QUICK_TUTORIAL"
  | "COURSE"
  | "ONBOARDING"
  | "FEATURE_SPOTLIGHT"
  | "SUPPORT"
  | "BRAND_MOTIVATIONAL"
  | "FREEFORM";

export type VideoTemplateId =
  | "saas-premium-ad"
  | "quick-tutorial"
  | "professional-course"
  | "feature-spotlight"
  | "customer-onboarding"
  | "visual-support"
  | "brand-motivational"
  | "fullpos-premium-vertical";

export type SceneType =
  | "TITLE"
  | "SCREENSHOT"
  | "SCREEN_RECORDING"
  | "DEVICE_SHOWCASE"
  | "AI_BACKGROUND"
  | "TEXT"
  | "CHAPTER"
  | "CALLOUT"
  | "SUMMARY"
  | "CTA"
  | "IMAGE"
  | "VIDEO"
  | "BRAND_INTRO"
  | "BRAND_OUTRO";

export type SubtitleMode = "OFF" | "AUTO_FROM_NARRATION" | "CUSTOM";
export type NarrationStyle = "PROMOTIONAL" | "TRAINING" | "QUICK_TUTORIAL" | "CORPORATE" | "MOTIVATIONAL";
export type AssetType = "logo" | "billing" | "products" | "reports" | "mobile" | "additional" | "screen_recording" | "image" | "video";
export type RenderStatus = "QUEUED" | "RENDERING" | "COMPLETED" | "FAILED";
export type AdFormat = "9:16" | "16:9" | "1:1" | "4:5";

export interface FocusKeyframe {
  time?: number;
  timeSeconds?: number;
  x: number;
  y: number;
  scale: number;
}

export interface CustomSubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface VideoScene {
  id: string;
  projectId?: string;
  type: SceneType;
  order: number;
  chapter?: string;
  chapterTitleEnabled?: boolean;
  title: string;
  duration: number;
  durationMode?: "AUTO" | "MANUAL";
  narrationScript?: string;
  voiceProfile?: string;
  narrationStyle?: NarrationStyle;
  narrationAudioPath?: string;
  narrationDurationSeconds?: number;
  assetRefs?: string[];
  mediaAssetId?: string;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  sourceAudioEnabled?: boolean;
  scale?: number;
  positionX?: number;
  positionY?: number;
  crop?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  customSubtitles?: CustomSubtitleCue[];
  transition?: string;
  animation?: {
    focus?: FocusKeyframe[];
    callouts?: Array<{
      type: "HighlightBox" | "ArrowCallout" | "CircleCallout" | "SpotlightCallout" | "TextCallout" | "StepBadge" | "CursorPulse" | "BlurRegion";
      label?: string;
      x: number;
      y: number;
      startX?: number;
      startY?: number;
      endX?: number;
      endY?: number;
      width?: number;
      height?: number;
      at?: number;
      startTime?: number;
      endTime?: number;
      style?: "outline" | "soft-glow" | "dim-outside" | "straight" | "curved";
      animation?: "appear" | "pulse-once" | "static" | "draw-on";
    }>;
  };
}

export interface TemplateMetadata {
  id: VideoTemplateId;
  name: string;
  videoTypes: VideoType[];
  defaultAspectRatio: AdFormat;
  supportedAspectRatios: AdFormat[];
  defaultDurationMode: "15_SEC" | "30_SEC" | "60_SEC" | "CUSTOM" | "SCENE_BASED" | "LONG_FORM";
  supportsAi: boolean;
  supportsMusic: boolean;
  supportsVoice: boolean;
  supportsScreenRecording: boolean;
  supportsChapters: boolean;
}

export interface BrandProfile {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  logoPrimaryAssetId?: string;
  logoLightAssetId?: string;
  logoDarkAssetId?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  website?: string;
  whatsapp?: string;
  email?: string;
  defaultCTA?: string;
  defaultOffer?: string;
  defaultPriceText?: string;
  defaultVoiceProfile?: string;
  defaultNarrationStyle?: NarrationStyle;
  defaultMusicTrackId?: string;
  defaultMusicVolume?: number;
  defaultIntroTemplate?: string;
  defaultOutroTemplate?: string;
  watermarkEnabled?: boolean;
  watermarkAssetId?: string;
  watermarkPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  watermarkOpacity?: number;
  fontHeading?: string;
  fontBody?: string;
  musicPreferences?: string[];
  pronunciationDictionary?: Array<{ writtenText: string; spokenText: string }>;
}

export interface RenderPayload {
  projectId: string;
  videoType?: VideoType;
  template: VideoTemplateId;
  format: AdFormat;
  fps: number;
  durationSeconds: number;
  narrationStyle?: NarrationStyle;
  subtitleMode?: SubtitleMode;
  brandProfile?: BrandProfile;
  brand: {
    name: string;
    headline: string;
    subheadline?: string;
    offer: string;
    price: string;
    website: string;
  };
  assets: Partial<Record<AssetType, string>>;
  scenesList?: VideoScene[];
  audio?: {
    voiceoverEnabled?: boolean;
    musicEnabled?: boolean;
    voiceoverScript?: string;
    voiceProfile?: string;
    voiceName?: string;
    voiceId?: string;
    voiceReferencePath?: string;
    voiceSpeed?: number;
    voiceOverPath?: string;
    musicPath?: string;
    musicVolume?: number;
    voiceVolume?: number;
    voiceStartSeconds?: number;
  };
  scenes?: Partial<Record<"billing" | "products" | "reports" | "mobile" | "devices", {
    scale?: number;
    x?: number;
    y?: number;
    fit?: "cover" | "contain";
  }>>;
  visual?: {
    style?: string;
    motion?: string;
    aiSceneMode?: "standard" | "hybrid" | "full-ai-experimental";
    aiMotionIntensity?: "elegant" | "cinematic" | "dynamic";
    aiBackgroundVideoPath?: string;
    aiBackgroundImagePath?: string;
  };
}
