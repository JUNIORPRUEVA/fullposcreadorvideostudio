import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
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

  const { payload: hydratedPayload, cleanup } = await hydrateAssetSources(payload);
  try {
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

    const size = sizeForFormat(hydratedPayload.format, composition.width, composition.height);
    const renderComposition = {
      ...composition,
      width: size.width,
      height: size.height,
      durationInFrames: Math.max(1, Math.round((hydratedPayload.durationSeconds || 25) * (hydratedPayload.fps || composition.fps)))
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
  } finally {
    await cleanup();
  }

  return outputLocation;
}

function sizeForFormat(format: RenderPayload["format"], fallbackWidth: number, fallbackHeight: number) {
  if (format === "16:9") return { width: 1920, height: 1080 };
  if (format === "1:1") return { width: 1080, height: 1080 };
  if (format === "4:5") return { width: 1080, height: 1350 };
  if (format === "9:16") return { width: 1080, height: 1920 };
  return { width: fallbackWidth, height: fallbackHeight };
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

interface HydratedPayload {
  payload: RenderPayload;
  cleanup: () => Promise<void>;
}

async function hydrateAssetSources(payload: RenderPayload): Promise<HydratedPayload> {
  const assets = { ...payload.assets };
  let videoServer: LocalVideoServer | undefined;
  const getVideoServer = async () => {
    videoServer ??= await createLocalVideoServer();
    return videoServer;
  };
  for (const [key, value] of Object.entries(assets)) {
    if (!value || value.startsWith("data:") || value.startsWith("http:") || value.startsWith("https:")) {
      continue;
    }
    const absolute = path.resolve(value);
    if (!existsSync(absolute)) continue;
    if (isVideoPath(absolute)) {
      assets[key as keyof typeof assets] = await (await getVideoServer()).add(absolute);
      continue;
    }
    const data = await readFile(absolute);
    assets[key as keyof typeof assets] = `data:${assetMimeForPath(absolute)};base64,${data.toString("base64")}`;
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
      if (key === "aiBackgroundVideoPath") {
        visual[key] = await (await getVideoServer()).add(absolute);
        continue;
      }
      const data = await readFile(absolute);
      visual[key] = `data:${mimeForPath(absolute)};base64,${data.toString("base64")}`;
    }
  }
  const scenesList = payload.scenesList?.map((scene) => ({ ...scene }));
  if (scenesList) {
    for (const scene of scenesList) {
      const value = scene.narrationAudioPath;
      if (!value || value.startsWith("data:") || value.startsWith("http:") || value.startsWith("https:")) continue;
      const absolute = path.resolve(value);
      if (!existsSync(absolute)) {
        scene.narrationAudioPath = undefined;
        continue;
      }
      const data = await readFile(absolute);
      scene.narrationAudioPath = `data:${audioMimeForPath(absolute)};base64,${data.toString("base64")}`;
    }
  }
  return {
    payload: { ...payload, assets, audio, visual, scenesList },
    cleanup: async () => {
      await videoServer?.close();
    }
  };
}

function mimeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function assetMimeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4" || extension === ".webm") return videoMimeForPath(filePath);
  return mimeForPath(filePath);
}

function isVideoPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".mp4" || extension === ".webm";
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

interface LocalVideoServer {
  add: (filePath: string) => Promise<string>;
  close: () => Promise<void>;
}

async function createLocalVideoServer(): Promise<LocalVideoServer> {
  const videos = new Map<string, { filePath: string; mimeType: string }>();
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const match = requestUrl.pathname.match(/^\/video\/([a-f0-9-]+)$/);
      if (!match) {
        response.writeHead(404).end();
        return;
      }
      const video = videos.get(match[1]);
      if (!video) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(video.filePath);
      response.writeHead(200, {
        "Content-Type": video.mimeType,
        "Content-Length": data.byteLength,
        "Cache-Control": "no-store"
      });
      response.end(data);
    } catch {
      response.writeHead(500).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start local video asset server.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    add: async (filePath: string) => {
      const token = randomUUID();
      videos.set(token, { filePath, mimeType: videoMimeForPath(filePath) });
      return `${baseUrl}/video/${token}`;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

function findLocalChromeHeadlessShell() {
  const projectRoot = path.resolve(import.meta.dirname, "../../..");
  const candidates = [
    path.join(projectRoot, "packages", "video", "node_modules", ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
    path.join(projectRoot, "apps", "api", "node_modules", ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
