import { BadRequestException } from "@nestjs/common";
import { allowedAssetMimeTypes, type AdFormat, type AssetType, type VideoType } from "@fullpos-ad-studio/shared";
import { templateCatalog, videoTypes } from "../video-studio/video-studio.metadata.js";

export const assetTypes: AssetType[] = ["logo", "billing", "products", "reports", "mobile", "additional", "screen_recording", "image", "video"];
export const adFormats: AdFormat[] = ["9:16", "16:9", "1:1", "4:5"];
export const supportedVideoTypes = videoTypes.map((item) => item.id);

export interface ProjectInput {
  name: string;
  videoType?: VideoType;
  productName?: string;
  headline: string;
  subheadline?: string;
  offer: string;
  price: string;
  website: string;
  template?: string;
  format?: AdFormat;
  durationMode?: string;
  durationSeconds?: number;
  subtitleMode?: string;
  narrationStyle?: string;
  brandProfileId?: string;
  voiceoverEnabled?: boolean;
  voiceoverScript?: string;
  voiceProfile?: string;
  voiceName?: string;
  voiceId?: string;
  voiceReferenceId?: string;
  voiceReferencePath?: string;
  voiceReferenceName?: string;
  voiceSpeed?: number;
  voiceVolume?: number;
  musicEnabled?: boolean;
  musicTrackId?: string;
  musicPath?: string;
  customMusicPath?: string;
  musicVolume?: number;
  visualStyle?: string;
  motionIntensity?: string;
}

function cleanString(value: unknown, field: string, required = true, maxLength = 240) {
  if (value === undefined || value === null || value === "") {
    if (!required) return undefined;
    throw new BadRequestException(`${field} is required.`);
  }
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed && required) {
    throw new BadRequestException(`${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new BadRequestException(`${field} is too long.`);
  }
  return trimmed;
}

function cleanBoolean(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${field} must be a boolean.`);
  }
  return value;
}

function cleanNumber(value: unknown, field: string, min: number, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequestException(`${field} must be a number.`);
  }
  if (value < min || value > max) {
    throw new BadRequestException(`${field} must be between ${min} and ${max}.`);
  }
  return value;
}

export function validateProjectInput(body: Record<string, unknown>, partial = false): Partial<ProjectInput> {
  const input: Partial<ProjectInput> = {};
  const required = !partial;

  for (const field of ["name", "headline", "offer", "price", "website"] as const) {
    const value = cleanString(body[field], field, required);
    if (value !== undefined) input[field] = value;
  }

  const productName = cleanString(body.productName, "productName", false);
  if (productName !== undefined) input.productName = productName;

  const videoType = (body.videoType ?? "ADVERTISEMENT") as VideoType;
  if (!supportedVideoTypes.includes(videoType)) {
    throw new BadRequestException("Unsupported videoType.");
  }
  input.videoType = videoType;

  const subheadline = cleanString(body.subheadline, "subheadline", false);
  if (subheadline !== undefined) input.subheadline = subheadline;

  const voiceoverScript = cleanString(body.voiceoverScript, "voiceoverScript", false, 2000);
  if (voiceoverScript !== undefined) input.voiceoverScript = voiceoverScript;

  const voiceProfile = cleanString(body.voiceProfile, "voiceProfile", false);
  if (voiceProfile !== undefined) input.voiceProfile = voiceProfile;

  const voiceName = cleanString(body.voiceName, "voiceName", false);
  if (voiceName !== undefined) input.voiceName = voiceName;

  const voiceId = cleanString(body.voiceId, "voiceId", false);
  if (voiceId !== undefined) input.voiceId = voiceId;

  const voiceReferenceId = cleanString(body.voiceReferenceId, "voiceReferenceId", false);
  if (voiceReferenceId !== undefined) input.voiceReferenceId = voiceReferenceId;

  const voiceReferencePath = cleanString(body.voiceReferencePath, "voiceReferencePath", false, 520);
  if (voiceReferencePath !== undefined) input.voiceReferencePath = voiceReferencePath;

  const voiceReferenceName = cleanString(body.voiceReferenceName, "voiceReferenceName", false);
  if (voiceReferenceName !== undefined) input.voiceReferenceName = voiceReferenceName;

  const durationMode = cleanString(body.durationMode, "durationMode", false);
  if (durationMode !== undefined) input.durationMode = durationMode;

  const subtitleMode = cleanString(body.subtitleMode, "subtitleMode", false);
  if (subtitleMode !== undefined) input.subtitleMode = subtitleMode;

  const narrationStyle = cleanString(body.narrationStyle, "narrationStyle", false);
  if (narrationStyle !== undefined) input.narrationStyle = narrationStyle;

  const brandProfileId = cleanString(body.brandProfileId, "brandProfileId", false);
  if (brandProfileId !== undefined) input.brandProfileId = brandProfileId;

  const musicTrackId = cleanString(body.musicTrackId, "musicTrackId", false);
  if (musicTrackId !== undefined) input.musicTrackId = musicTrackId;

  const musicPath = cleanString(body.musicPath, "musicPath", false, 520);
  if (musicPath !== undefined) input.musicPath = musicPath;

  const customMusicPath = cleanString(body.customMusicPath, "customMusicPath", false, 520);
  if (customMusicPath !== undefined) input.customMusicPath = customMusicPath;

  const voiceoverEnabled = cleanBoolean(body.voiceoverEnabled, "voiceoverEnabled");
  if (voiceoverEnabled !== undefined) input.voiceoverEnabled = voiceoverEnabled;

  const musicEnabled = cleanBoolean(body.musicEnabled, "musicEnabled");
  if (musicEnabled !== undefined) input.musicEnabled = musicEnabled;

  const voiceSpeed = cleanNumber(body.voiceSpeed, "voiceSpeed", 0.9, 1.1);
  if (voiceSpeed !== undefined) input.voiceSpeed = voiceSpeed;

  const voiceVolume = cleanNumber(body.voiceVolume, "voiceVolume", 0, 1);
  if (voiceVolume !== undefined) input.voiceVolume = voiceVolume;

  const musicVolume = cleanNumber(body.musicVolume, "musicVolume", 0, 1);
  if (musicVolume !== undefined) input.musicVolume = musicVolume;

  const durationSeconds = cleanNumber(body.durationSeconds, "durationSeconds", 1, 60 * 60);
  if (durationSeconds !== undefined) input.durationSeconds = durationSeconds;

  const visualStyle = cleanString(body.visualStyle, "visualStyle", false);
  if (visualStyle !== undefined) input.visualStyle = visualStyle;

  const motionIntensity = cleanString(body.motionIntensity, "motionIntensity", false);
  if (motionIntensity !== undefined) input.motionIntensity = motionIntensity;

  const template = cleanString(body.template, "template", false);
  input.template = template ?? "saas-premium-ad";
  const supportedTemplateIds = new Set([...templateCatalog.map((item) => item.id), "fullpos-premium-vertical"]);
  if (!supportedTemplateIds.has(input.template)) {
    throw new BadRequestException("Unsupported template.");
  }

  const format = (body.format ?? "9:16") as AdFormat;
  if (!adFormats.includes(format)) {
    throw new BadRequestException("Unsupported format.");
  }
  input.format = format;

  return input;
}

export function validateAssetUpload(type: string | undefined, file?: Express.Multer.File): asserts file is Express.Multer.File {
  if (!type || !assetTypes.includes(type as AssetType)) {
    throw new BadRequestException("Unsupported asset type.");
  }
  if (!file) {
    throw new BadRequestException("File is required.");
  }
  if (!allowedAssetMimeTypes.includes(file.mimetype as (typeof allowedAssetMimeTypes)[number])) {
    throw new BadRequestException("Unsupported file type. Use PNG, JPG, JPEG, WEBP, MP4, or WEBM.");
  }
  const maxSize = type === "screen_recording" || type === "video" ? 250 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new BadRequestException(`File is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`);
  }
}
