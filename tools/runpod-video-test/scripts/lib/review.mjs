/**
 * FASE 13 / FASE 26 - human review pages.
 *
 * A page is written next to the artefacts so it opens straight from disk
 * (file://) with no server. Everything the reviewer needs sits on one page:
 * the original input, the clip, the extracted frames and the technical numbers.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { outputRoot } from "./paths.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Relative URL from the page's own folder; keeps file:// links short and valid. */
function relativeUrl(fromDir, target) {
  const url = path.relative(fromDir, target).split(path.sep).join("/");
  return url.startsWith(".") ? url : `./${url}`;
}

function humanBytes(bytes) {
  if (!bytes) return "n/a";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #0b1220; color: #e8eefc;
         font: 15px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  h2 { font-size: 17px; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #24324d; }
  .muted { color: #93a4c4; font-size: 13px; }
  .banner { margin: 18px 0; padding: 14px 18px; border-radius: 10px; border: 1px solid #3a4a6b;
            background: #14203a; font-weight: 600; }
  .banner.warn { border-color: #7a5a1e; background: #2a2113; color: #f2d08a; }
  .banner.ok { border-color: #1f5f45; background: #10281f; color: #8fe0bd; }
  .banner.bad { border-color: #7a2b2b; background: #2b1414; color: #f0a0a0; }
  .grid { display: grid; gap: 18px; }
  .grid.two { grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr); }
  .grid.frames { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .card { background: #111c31; border: 1px solid #22304c; border-radius: 12px; padding: 14px; }
  .card h3 { margin: 0 0 10px; font-size: 14px; letter-spacing: .03em; text-transform: uppercase; color: #9fb4d8; }
  img, video { display: block; width: 100%; border-radius: 8px; background: #000; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #22304c; }
  th { color: #9fb4d8; font-weight: 600; }
  code { background: #17253d; padding: 2px 6px; border-radius: 5px; font-size: 12.5px; }
  ul { margin: 8px 0 0; padding-left: 20px; }
  li { margin: 3px 0; }
`;

function metricsTable(metrics) {
  const rows = metrics
    .filter((metric) => metric.value !== undefined && metric.value !== null && metric.value !== "")
    .map((metric) => `<tr><th>${escapeHtml(metric.label)}</th><td>${escapeHtml(metric.value)}</td></tr>`)
    .join("\n");
  return `<table>${rows}</table>`;
}

function section(title, body) {
  return `<h2>${escapeHtml(title)}</h2>\n${body}`;
}

function card(title, body) {
  return `<div class="card"><h3>${escapeHtml(title)}</h3>${body}</div>`;
}

function probeMetrics(label, probe) {
  if (!probe) return [{ label: `${label}`, value: "not probed" }];
  return [
    { label: `${label} | file`, value: probe.exists ? `${humanBytes(probe.bytes)}` : "MISSING" },
    { label: `${label} | codec`, value: `${probe.videoCodec ?? "?"} / ${probe.pixelFormat ?? "?"}` },
    { label: `${label} | resolution`, value: `${probe.width ?? "?"}x${probe.height ?? "?"}` },
    { label: `${label} | fps`, value: probe.fps ?? "?" },
    { label: `${label} | duration`, value: probe.duration !== undefined ? `${probe.duration}s` : "?" },
    { label: `${label} | video stream`, value: probe.hasVideo ? "yes" : "NO" },
    { label: `${label} | audio stream`, value: probe.hasAudio ? "yes" : "no" }
  ];
}

function frameCards(frameItems, fromDir) {
  return frameItems
    .map(
      (frame) =>
        card(
          frame.label,
          `<img src="${relativeUrl(fromDir, frame.path)}" alt="${escapeHtml(frame.label)}">`
        )
    )
    .join("\n");
}

function aiInspectionBanner(aiInspection, notes = []) {
  if (aiInspection === "PASS") {
    return `<div class="banner ok">AI visual inspection: PASS${notes.length ? ` - ${escapeHtml(notes.join(" | "))}` : ""}</div>`;
  }
  if (aiInspection === "FAIL") {
    return `<div class="banner bad">AI visual inspection: FAIL${notes.length ? ` - ${escapeHtml(notes.join(" | "))}` : ""}</div>`;
  }
  return `<div class="banner warn">MANUAL_VISUAL_REVIEW_REQUIRED - no AI visual inspection was performed on these frames.</div>`;
}

/**
 * FASE 13 - per-clip review page: original image vs the five extracted frames.
 */
export async function writeClipReview({ imagePath, imageMeta, frames, clipPath, clipProbe, analysis, aiInspection = "NOT_AVAILABLE", notes = [], outputPath }) {
  const pageDir = path.dirname(outputPath);
  await mkdir(pageDir, { recursive: true });

  const body = [
    `<h1>RunPod clip review</h1>`,
    `<p class="muted">Generated locally by <code>tools/runpod-video-test</code>. Frames are decoded from the real MP4.</p>`,
    aiInspectionBanner(aiInspection, notes),
    section(
      "Original input vs generated clip",
      `<div class="grid two">
        ${card("Original screenshot (input, unmodified)", `<img src="${relativeUrl(pageDir, imagePath)}" alt="input">`)}
        ${card("Generated clip", `<video controls preload="metadata" src="${relativeUrl(pageDir, clipPath)}"></video>`)}
      </div>`
    ),
    section("Extracted frames", `<div class="grid frames">${frameCards(frames, pageDir)}</div>`),
    section(
      "Technical metrics",
      metricsTable([
        { label: "input file", value: imageMeta?.name },
        { label: "input format", value: imageMeta ? `${imageMeta.mimeType} (${imageMeta.format})` : undefined },
        { label: "input size", value: imageMeta ? humanBytes(imageMeta.bytes) : undefined },
        { label: "input resolution", value: imageMeta ? `${imageMeta.width}x${imageMeta.height}` : undefined },
        ...probeMetrics("clip", clipProbe),
        { label: "frame analysis", value: analysis?.summary }
      ])
    )
  ].join("\n");

  await writeFile(outputPath, page(escapeHtml("RunPod clip review"), body), "utf8");
  return outputPath;
}

/**
 * FASE 26 - final review page: master video, its frames, every clip and every input.
 */
export async function writeFinalReview({ finalPath, finalProbe, finalFrames, clipEntries, imageEntries, analysis, aiInspection = "NOT_AVAILABLE", notes = [], outputPath }) {
  const pageDir = path.dirname(outputPath);
  await mkdir(pageDir, { recursive: true });

  const clipCards = clipEntries
    .map((entry) =>
      card(
        `${entry.label}${entry.caption ? ` - ${entry.caption}` : ""}`,
        `<video controls preload="metadata" src="${relativeUrl(pageDir, entry.path)}"></video>
         <p class="muted">${escapeHtml(entry.detail ?? "")}</p>`
      )
    )
    .join("\n");

  const imageCards = imageEntries
    .map((entry) => card(entry.label, `<img src="${relativeUrl(pageDir, entry.path)}" alt="${escapeHtml(entry.label)}">`))
    .join("\n");

  const body = [
    `<h1>FullPOS - RunPod + FFmpeg POC | final review</h1>`,
    `<p class="muted">Assembled locally with FFmpeg. No marketing text in this video was written by a model.</p>`,
    aiInspectionBanner(aiInspection, notes),
    section("Final video", `<div class="grid two">${card("fullpos-runpod-demo.mp4", `<video controls preload="metadata" src="${relativeUrl(pageDir, finalPath)}"></video>`)}${card("Technical summary", metricsTable(probeMetrics("final", finalProbe)))}</div>`),
    section("Final frames", `<div class="grid frames">${frameCards(finalFrames, pageDir)}</div>`),
    section("Individual clips", `<div class="grid frames">${clipCards || "<p class=\"muted\">No clips.</p>"}</div>`),
    section("Original inputs", `<div class="grid frames">${imageCards || "<p class=\"muted\">No inputs.</p>"}</div>`),
    section("Frame analysis", metricsTable([{ label: "summary", value: analysis?.summary }, { label: "black frames", value: analysis?.blackFrames }, { label: "flat frames", value: analysis?.flatFrames }]))
  ].join("\n");

  await writeFile(outputPath, page(escapeHtml("FullPOS RunPod POC - final review"), body), "utf8");
  return outputPath;
}

/**
 * A/B page: the same screenshot, animated two ways.
 *
 * The metric is measured, not asserted: at frame 0 no camera movement has
 * happened yet, so ANY pixel difference between the two renders is content the
 * generator changed rather than framing. `diffRatio` keeps such changes visible
 * even when they are small (a renamed word, a changed number).
 */
export async function writeComparisonPage({ scenes, finals, outputPath, note }) {
  const pageDir = path.dirname(outputPath);
  await mkdir(pageDir, { recursive: true });

  const rows = scenes
    .map((scene) => {
      const cell = (title, body) => `<div class="card"><h3>${escapeHtml(title)}</h3>${body}</div>`;
      const frame = (file, alt) =>
        file ? `<img src="${relativeUrl(pageDir, file)}" alt="${escapeHtml(alt)}">` : `<p class="muted">n/a</p>`;

      const runpodBody = scene.runpodClip
        ? `<video controls preload="metadata" src="${relativeUrl(pageDir, scene.runpodClip)}"></video>`
        : `<p class="muted">not generated</p>`;
      const localBody = scene.localClip
        ? `<video controls preload="metadata" src="${relativeUrl(pageDir, scene.localClip)}"></video>`
        : `<p class="muted">not generated</p>`;

      const metric =
        scene.pixelDifference !== undefined
          ? `<div class="banner ${scene.pixelDifference === "0.00%" ? "ok" : "bad"}">At frame 0 (no camera movement yet) the
             model version differs from the pixel-exact version in <b>${escapeHtml(scene.pixelDifference)}</b> of pixels.</div>`
          : "";

      return `
      <h2>${escapeHtml(scene.label)}</h2>
      ${metric}
      <h3 style="color:#9fb4d8;font-size:14px;margin:14px 0 6px">First frame — the same instant, side by side</h3>
      <div class="grid two">
        ${cell("RunPod (generated)", frame(scene.runpodFrame0, "runpod first frame"))}
        ${cell("Pixel-exact (deterministic)", frame(scene.localFrame0, "deterministic first frame"))}
      </div>
      <h3 style="color:#9fb4d8;font-size:14px;margin:18px 0 6px">Last frame — 5 seconds later</h3>
      <div class="grid two">
        ${cell("RunPod (generated)", frame(scene.runpodFrame, "runpod last frame"))}
        ${cell("Pixel-exact (deterministic)", frame(scene.localFrame, "deterministic last frame"))}
      </div>
      <h3 style="color:#9fb4d8;font-size:14px;margin:18px 0 6px">Full clips</h3>
      <div class="grid two">
        ${cell("Original capture", frame(scene.original, "original screenshot"))}
        ${cell("RunPod image-to-video", runpodBody)}
      </div>
      <div class="grid two">
        ${cell("Deterministic FFmpeg motion", localBody)}
      </div>`;
    })
    .join("\n");

  const finalCards = finals
    .map((entry) =>
      card(
        `${entry.label} — ${entry.detail ?? ""}`,
        `<video controls preload="metadata" src="${relativeUrl(pageDir, entry.path)}"></video>`
      )
    )
    .join("\n");

  const body = [
    `<h1>A/B — the same screens, animated two ways</h1>`,
    note ? `<div class="banner warn">${escapeHtml(note)}</div>` : "",
    `<p class="muted">Both versions use the same screenshots, the same captions, the same intro/outro and the same
     local FFmpeg composition. The only difference is how the camera motion was produced.</p>`,
    section("Finished videos", `<div class="grid two">${finalCards || "<p class=\"muted\">none</p>"}</div>`),
    section("Scene by scene", rows || "<p class=\"muted\">no scenes</p>")
  ].join("\n");

  await writeFile(outputPath, page(escapeHtml("A/B comparison — RunPod vs deterministic"), body), "utf8");
  return outputPath;
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * Every asset the page points at must exist on disk, otherwise the reviewer opens
 * a broken page. Checked on disk (no browser needed) right after writing.
 */
export async function verifyPageLinks(pagePath) {
  const html = await readFile(pagePath, "utf8");
  const directory = path.dirname(pagePath);
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|data:|#)/.test(value));

  const resolved = [];
  const missing = [];
  for (const reference of new Set(references)) {
    const target = path.resolve(directory, reference);
    if (existsSync(target) && statSync(target).size > 0) resolved.push(reference);
    else missing.push(reference);
  }
  return { page: pagePath, total: new Set(references).size, resolved: resolved.length, missing };
}

export function clipReviewPath() {
  return path.join(outputRoot, "review.html");
}

export function finalReviewPath() {
  return path.join(outputRoot, "review-final.html");
}
