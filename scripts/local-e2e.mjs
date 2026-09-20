import { createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const assetsDir = path.resolve("assets/demo/e2e");

async function json(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

const project = await json(`${apiUrl}/projects`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: `Phase 2 E2E ${new Date().toISOString()}`,
    productName: "FullPOS Cloud",
    headline: "Tu negocio bajo control",
    subheadline: "Facturación, inventario y reportes en una sola plataforma.",
    offer: "7 DÍAS GRATIS",
    price: "Desde RD$1,000/mes",
    website: "fullposcloud.fulltechrd.com",
    template: "fullpos-premium-vertical",
    format: "9:16"
  })
});

const uploads = [
  ["logo", "logo.png"],
  ["billing", "billing.png"],
  ["products", "products.png"],
  ["reports", "reports.png"],
  ["mobile", "mobile.png"]
];

for (const [type, file] of uploads) {
  const filePath = path.join(assetsDir, file);
  if (!existsSync(filePath)) throw new Error(`Missing E2E asset: ${filePath}`);
  const form = new FormData();
  const blob = new Blob([await import("node:fs/promises").then((fs) => fs.readFile(filePath))], { type: "image/png" });
  form.append("file", blob, file);
  await json(`${apiUrl}/projects/${project.id}/assets?type=${type}`, {
    method: "POST",
    body: form
  });
}

const renderJob = await json(`${apiUrl}/projects/${project.id}/render`, { method: "POST" });
let current = renderJob;
const started = Date.now();

while (["QUEUED", "RENDERING"].includes(current.status)) {
  if (Date.now() - started > 180_000) {
    throw new Error(`Render timed out at ${current.progress}%`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2500));
  current = await json(`${apiUrl}/renders/${renderJob.id}`);
  console.log(`Render ${current.status} ${current.progress}%`);
}

if (current.status !== "COMPLETED") {
  throw new Error(current.errorMessage ?? "Render failed");
}

const response = await fetch(`${apiUrl}/renders/${renderJob.id}/file`);
if (!response.ok || !response.body) {
  throw new Error(`Download failed: ${response.status}`);
}

const outputDir = path.resolve("storage/temp/e2e-downloads");
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `${renderJob.id}.mp4`);
await new Promise((resolve, reject) => {
  Readable.fromWeb(response.body).pipe(createWriteStream(outputPath)).on("finish", resolve).on("error", reject);
});

const size = statSync(outputPath).size;
if (size <= 0) throw new Error("Downloaded MP4 is empty");

console.log(JSON.stringify({
  projectId: project.id,
  renderId: renderJob.id,
  status: current.status,
  progress: current.progress,
  outputPath: current.outputPath,
  downloadedFile: outputPath,
  downloadedSize: size
}, null, 2));
