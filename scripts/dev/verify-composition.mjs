#!/usr/bin/env node
/*
 * Verificacion visual de la composicion del video (Fases 2, 25, 26, 32, 36).
 *
 * Renderiza una escena real de curso con la captura de FullPOS, extrae frames
 * (0.5 s / 2.5 s / 4.5 s) y mide la fidelidad de la captura dentro del video
 * (PSNR y SSIM) comparando contra el archivo original.
 *
 * Solo local: escribe en storage/renders y storage/temp. No toca la base de
 * datos ni produccion.
 */
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { renderProfessionalCoursePreview } from "../../packages/video/dist/index.js";
import { COURSE_SCENE_COMPOSITION, screenshotFrame } from "../../packages/shared/dist/index.js";

const exec = promisify(execFile);
const ROOT = process.cwd();
const OUT_ID = "qa-composition";
const OUT_DIR = path.join(ROOT, "storage", "renders", OUT_ID);
const FRAMES = path.join(ROOT, "storage", "temp", "composicion");
const SOURCE = path.join(ROOT, "assets", "demo", "e2e", "billing.png");
const FFMPEG = "ffmpeg";
const FFPROBE = "ffprobe";

async function probe(file) {
  const { stdout } = await exec(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name,crf,pix_fmt", "-show_entries", "format=duration", "-of", "json", file]);
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  return { width: stream.width, height: stream.height, codec: stream.codec_name, pixFmt: stream.pix_fmt, duration: Number(parsed.format?.duration ?? 0) };
}

async function filterMetric(a, b, filter) {
  let text = "";
  try {
    const { stderr } = await exec(FFMPEG, ["-hide_banner", "-i", a, "-i", b, "-lavfi", `[0:v]scale=1920:1080:flags=lanczos[a];[1:v]scale=1920:1080:flags=lanczos[b];[a][b]${filter}`, "-f", "null", "-"], { maxBuffer: 1 << 24 });
    text = stderr;
  } catch (error) {
    text = String(error.stderr ?? error.message);
  }
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const metricLine = lines.find((line) => line.includes("average:") || line.includes("All:"));
  return metricLine ?? lines.pop() ?? "sin medicion";
}

async function main() {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  await rm(OUT_DIR, { recursive: true, force: true });

  const source = await probe(SOURCE);
  console.log(`fuente        : ${path.basename(SOURCE)} ${source.width}x${source.height} ${source.codec}`);

  const scene = {
    id: "qa-scene",
    projectId: OUT_ID,
    type: "SCREENSHOT",
    order: 1,
    chapter: "Facturación",
    title: "Registrar una venta",
    duration: 5,
    narrationScript: "Factura más rápido y controla cada venta.",
    mediaAssetId: "billing"
  };

  console.log("renderizando escena de 5 s...");
  const started = Date.now();
  const output = await renderProfessionalCoursePreview(
    {
      projectId: OUT_ID,
      videoType: "COURSE",
      template: "professional-course",
      format: "16:9",
      fps: 30,
      durationSeconds: 5,
      subtitleMode: "OFF",
      narrationStyle: "TRAINING",
      brand: { name: "FullPOS", headline: "Facturación rápida", subheadline: "", offer: "", price: "", website: "" },
      brandProfile: { name: "FullPOS", primaryColor: "#1457d9", secondaryColor: "#10a8c9" },
      visual: { style: "technology-cinematic", aiSceneMode: "hybrid" },
      audio: { voiceoverEnabled: false, musicEnabled: false },
      assets: { billing: SOURCE, image: SOURCE, logo: path.join(ROOT, "assets", "demo", "e2e", "logo.png") },
      scenesList: [scene]
    },
    { renderId: OUT_ID, outputRoot: path.join(ROOT, "storage", "renders") }
  );
  console.log(`render OK en ${((Date.now() - started) / 1000).toFixed(1)} s -> ${path.relative(ROOT, output)}`);

  const rendered = await probe(output);
  console.log(`video final   : ${rendered.width}x${rendered.height} ${rendered.codec} ${rendered.pixFmt} ${rendered.duration.toFixed(2)} s`);

  for (const seconds of [0.5, 2.5, 4.5]) {
    await exec(FFMPEG, ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", output, "-frames:v", "1", "-y", path.join(FRAMES, `frame-${seconds}s.png`)]);
  }

  // Region exacta donde se dibuja la captura dentro del lienzo.
  const box = screenshotFrame(COURSE_SCENE_COMPOSITION);
  const scale = Math.min(box.width / source.width, box.height / source.height);
  const drawWidth = Math.round(source.width * scale);
  const drawHeight = Math.round(source.height * scale);
  const drawX = Math.round(box.x + (box.width - drawWidth) / 2);
  const drawY = Math.round(box.y + (box.height - drawHeight) / 2);
  console.log(`zona captura : ${drawWidth}x${drawHeight} en (${drawX},${drawY}) de ${COURSE_SCENE_COMPOSITION.canvasWidth}x${COURSE_SCENE_COMPOSITION.canvasHeight} (${(drawWidth / COURSE_SCENE_COMPOSITION.canvasWidth * 100).toFixed(1)}% del ancho)`);

  const crop = path.join(FRAMES, "captura-recortada.png");
  await exec(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", path.join(FRAMES, "frame-2.5s.png"), "-vf", `crop=${drawWidth}:${drawHeight}:${drawX}:${drawY}`, "-y", crop]);

  console.log("");
  console.log(`PSNR captura vs original : ${await filterMetric(crop, SOURCE, "psnr")}`);
  console.log(`SSIM captura vs original : ${await filterMetric(crop, SOURCE, "ssim")}`);
  console.log("");
  console.log(`frames para inspeccion visual: ${path.relative(ROOT, FRAMES)}`);
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
