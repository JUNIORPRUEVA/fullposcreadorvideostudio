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
  const composition = compositions.find((item) => item.id === "FullPOSPremiumVertical");

  if (!composition) {
    throw new Error("Remotion composition FullPOSPremiumVertical was not found.");
  }

  await renderMedia({
    composition,
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
  return { ...payload, assets };
}

function mimeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function findLocalChromeHeadlessShell() {
  const projectRoot = path.resolve(import.meta.dirname, "../../..");
  const candidates = [
    path.join(projectRoot, "packages", "video", "node_modules", ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
    path.join(projectRoot, "apps", "api", "node_modules", ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
