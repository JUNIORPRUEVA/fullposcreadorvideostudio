import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { aiVideoRoot, assertInside } from "../lib/paths.js";

export async function saveAiVideoBuffer(projectId: string, jobId: string, buffer: Buffer) {
  const directory = path.join(aiVideoRoot, projectId);
  const outputPath = path.join(directory, `${jobId}.mp4`);
  assertInside(aiVideoRoot, outputPath);
  await mkdir(directory, { recursive: true });
  await writeFile(outputPath, buffer);
  return outputPath;
}

export async function downloadAiVideo(projectId: string, jobId: string, videoUrl: string, fetchFn: typeof fetch = fetch) {
  const response = await fetchFn(videoUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`No se pudo descargar el MP4 IA (${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return saveAiVideoBuffer(projectId, jobId, bytes);
}

