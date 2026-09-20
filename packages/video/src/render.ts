import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import type { RenderPayload } from "@fullpos-ad-studio/shared";

export interface RenderOptions {
  renderId: string;
  outputRoot: string;
  onProgress?: (progress: number) => void;
  compositionId?: "FullPOSPremiumVertical" | "HybridMobilePreview" | "QuickTutorialPreview" | "ProfessionalCoursePreview";
}

export async function renderFullPosVideo(payload: RenderPayload, options: RenderOptions): Promise<string> {
  const outputDir = path.resolve(options.outputRoot, options.renderId);
  await mkdir(outputDir, { recursive: true });
  const outputLocation = path.join(outputDir, "final.mp4");
  const compiledEntryPoint = path.resolve(import.meta.dirname, "../dist/register.js");
  const sourceEntryPoint = path.resolve(import.meta.dirname, "../src/register.ts");
  const entryPoint = existsSync(compiledEntryPoint) ? compiledEntryPoint : sourceEntryPoint;
  const browserExecutable = findLocalChromeHeadlessShell();

  const hydratedPayload = await hydrateAssetSources(payload);
  const bundled = await bundle({ entryPoint });
  const compositions = await getCompositions(bundled, {
    inputProps: { payload: hydratedPayload },
    browserExecutable
  });
  const compositionId = options.compositionId ?? "FullPOSPremiumVertical";
  const composition = compositions.find((item) => item.id === compositionId);

  if (!composition) {
    throw new Error(`Remotion composition ${compositionId} was not found.`);
  }

  const renderComposition = {
    ...composition,
    durationInFrames: Math.max(composition.durationInFrames, Math.round((hydratedPayload.durationSeconds || 25) * (hydratedPayload.fps || composition.fps)))
  };

  await renderMedia({
    composition: renderComposition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation,
    overwrite: true,
    inputProps: { payload: hydratedPayload },
    browserExecutable,
    chromiumOptions: {
      gl: "angle"
    },
    onProgress: ({ progress }) => {
      options.onProgress?.(Math.round(progress * 100));
    }
  });

  return outputLocation;
}

export function renderHybridMobilePreview(payload: RenderPayload, options: Omit<RenderOptions, "compositionId">): Promise<string> {
  return renderFullPosVideo(
    {
      ...payload,
      durationSeconds: 5,
      fps: 30,
      audio: { ...payload.audio, voiceoverEnabled: false, musicEnabled: false },
      visual: {
        ...payload.visual,
        aiSceneMode: "hybrid",
        aiMotionIntensity: normalizeMotion(payload.visual?.aiMotionIntensity ?? payload.visual?.motion)
      }
    },
    { ...options, compositionId: "HybridMobilePreview" }
  );
}

export function renderQuickTutorialPreview(payload: RenderPayload, options: Omit<RenderOptions, "compositionId">): Promise<string> {
  return renderFullPosVideo(
    {
      ...payload,
      videoType: "QUICK_TUTORIAL",
      template: "quick-tutorial",
      format: payload.format ?? "9:16",
      durationSeconds: payload.durationSeconds || 20,
      subtitleMode: payload.subtitleMode ?? "AUTO_FROM_NARRATION",
      narrationStyle: payload.narrationStyle ?? "QUICK_TUTORIAL",
      audio: { ...payload.audio, voiceoverEnabled: false, musicEnabled: false }
    },
    { ...options, compositionId: "QuickTutorialPreview" }
  );
}

export function renderProfessionalCoursePreview(payload: RenderPayload, options: Omit<RenderOptions, "compositionId">): Promise<string> {
  return renderFullPosVideo(
    {
      ...payload,
      videoType: "COURSE",
      template: "professional-course",
      format: "16:9",
      durationSeconds: payload.durationSeconds || 18,
      subtitleMode: payload.subtitleMode ?? "AUTO_FROM_NARRATION",
      narrationStyle: payload.narrationStyle ?? "TRAINING",
      audio: { ...payload.audio, voiceoverEnabled: false, musicEnabled: false }
    },
    { ...options, compositionId: "ProfessionalCoursePreview" }
  );
}

function normalizeMotion(value?: string): "elegant" | "cinematic" | "dynamic" {
  if (value === "elegant" || value === "dynamic") return value;
  return "cinematic";
}

async function hydrateAssetSources(payload: RenderPayload): Promise<RenderPayload> {
  const assets = { ...payload.assets };
  for (const [key, value] of Object.entries(assets)) {
    if (!value || value.startsWith("data:") || value.startsWith("http:") || value.startsWith("https:")) {
      continue;
    }
    const absolute = path.resolve(value);
    if (!existsSync(absolute)) continue;
    const data = await readFile(absolute);
    assets[key as keyof typeof assets] = `data:${mimeForPath(absolute)};base64,${data.toString("base64")}`;
  }
  const audio = payload.audio ? { ...payload.audio } : undefined;
  if (audio) {
    for (const key of ["voiceOverPath", "musicPath"] as const) {
      const value = audio[key];
      if (!value || value.startsWith("data:") || value.startsWith("http:") || value.startsWith("https:")) {
        continue;
      }
      const absolute = path.resolve(value);
      if (!existsSync(absolute)) {
        audio[key] = undefined;
        continue;
      }
      const data = await readFile(absolute);
      audio[key] = `data:${audioMimeForPath(absolute)};base64,${data.toString("base64")}`;
    }
  }
  const visual = payload.visual ? { ...payload.visual } : undefined;
  if (visual) {
    for (const key of ["aiBackgroundVideoPath", "aiBackgroundImagePath"] as const) {
      const value = visual[key];
      if (!value || value.startsWith("data:") || value.startsWith("http:") || value.startsWith("https:")) {
        continue;
      }
      const absolute = path.resolve(value);
      if (!existsSync(absolute)) {
        visual[key] = undefined;
        continue;
      }
      const data = await readFile(absolute);
      visual[key] = `data:${key === "aiBackgroundVideoPath" ? videoMimeForPath(absolute) : mimeForPath(absolute)};base64,${data.toString("base64")}`;
    }
  }
  return { ...payload, assets, audio, visual };
}

function mimeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function audioMimeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".ogg") return "audio/ogg";
  return "audio/wav";
}

function videoMimeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".webm") return "video/webm";
  return "video/mp4";
}

function findLocalChromeHeadlessShell() {
  const projectRoot = path.resolve(import.meta.dirname, "../../..");
  const candidates = [
    path.join(projectRoot, "packages", "video", "node_modules", ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
    path.join(projectRoot, "apps", "api", "node_modules", ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
