#!/usr/bin/env node
/*
 * Verificacion del flujo de subida del Video Studio (hardening de estado).
 *
 * Reproduce contra el API local el flujo real del editor:
 *   login -> crear proyecto -> subir archivo -> crear escena -> relectura
 * y comprueba, con tiempos y conteo de requests, que:
 *   - un proyecto armado con archivos propios NACE VACIO (sin los 8 pasos starter)
 *   - durante una subida lenta el proyecto sigue teniendo 0 pasos (nada de ghosts)
 *   - 1 imagen termina en exactamente 1 paso con media asociado
 *   - 5 imagenes terminan en exactamente 5 pasos, en orden, sin duplicados
 *
 * Solo trabaja en local, no toca el esquema ni ejecuta migraciones/seeds, y
 * borra todos los proyectos que crea.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const API = process.env.STUDIO_API_URL ?? "http://localhost:4000";
const SAMPLE = path.join(ROOT, "assets", "demo", "e2e", "billing.png");
const QA_PREFIX = "[QA-upload-state]";

let token = "";
const requests = [];
const timeline = [];

function mark(label) {
  timeline.push({ label, at: Number(process.hrtime.bigint() / 1000000n) });
}

async function loadOwner() {
  const env = await readFile(path.join(ROOT, "apps", "api", ".env"), "utf8");
  const map = {};
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_]+)\s*=\s*(.*)$/.exec(line);
    if (match) map[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
  if (!map.OWNER_EMAIL || !map.OWNER_PASSWORD) throw new Error("Faltan OWNER_EMAIL / OWNER_PASSWORD en apps/api/.env");
  return { email: map.OWNER_EMAIL, password: map.OWNER_PASSWORD };
}

async function api(pathname, init = {}, { raw = false } = {}) {
  const url = pathname.startsWith("http") ? pathname : `${API}${pathname}`;
  const headers = new Headers(init.headers ?? {});
  if (token && !init.skipAuth) headers.set("Authorization", `Bearer ${token}`);
  const started = Date.now();
  const response = await fetch(url, { ...init, headers });
  const duration = Date.now() - started;
  requests.push({ method: init.method ?? "GET", path: new URL(url).pathname, status: response.status, ms: duration });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${new URL(url).pathname} -> HTTP ${response.status}: ${await response.text()}`);
  return raw ? response : response.json();
}

async function createProject(starterStoryboard) {
  const project = await api("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${QA_PREFIX} ${Date.now()}`,
      videoType: "COURSE",
      productName: "FullPOS",
      format: "16:9",
      starterStoryboard
    })
  });
  return project;
}

async function uploadAsset(projectId, filename, buffer, { contentDelayMs = 0 } = {}) {
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const intent = await api(`/projects/${projectId}/assets/upload-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "image", filename, mimeType: "image/png", sizeBytes: buffer.length })
  });
  if (contentDelayMs) await new Promise((resolve) => setTimeout(resolve, contentDelayMs));
  const put = await fetch(intent.signedUrl.startsWith("http") ? intent.signedUrl : `${API}${intent.signedUrl}`, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: buffer
  });
  requests.push({ method: "PUT", path: "signed-url", status: put.status, ms: 0 });
  if (!put.ok) throw new Error(`PUT del archivo -> HTTP ${put.status}`);
  return api(`/projects/${projectId}/assets/complete-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "image", filename, mimeType: "image/png", sizeBytes: buffer.length, checksum, objectKey: intent.objectKey })
  });
}

async function createScene(projectId, order, title, mediaAssetId, chapter) {
  return api(`/projects/${projectId}/scenes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "IMAGE", order, chapter, title, duration: 5, durationMode: "AUTO", mediaAssetId, narrationScript: "" })
  });
}

async function deleteProject(projectId) {
  await api(`/projects/${projectId}`, { method: "DELETE" });
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
}

async function main() {
  const owner = await loadOwner();
  const login = await api("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(owner), skipAuth: true });
  token = login.token;

  // El backend solo siembra los 8 pasos si el cliente lo pide explicitamente.
  const withStarters = await createProject(true);
  check("starterStoryboard:true siembra los 8 pasos de plantilla", withStarters.scenes.length === 8, `${withStarters.scenes.length} escenas`);
  await deleteProject(withStarters.id);

  // Caso del video: proyecto armado con archivos propios.
  const project = await createProject(false);
  check("starterStoryboard:false (proyecto con archivos) nace VACIO", project.scenes.length === 0, `${project.scenes.length} escenas`);

  const buffer = await readFile(SAMPLE);
  mark("archivo elegido");

  // Subida lenta (Fase 15): durante la espera el proyecto debe seguir con 0 pasos.
  const slowAsset = uploadAsset(project.id, "billing.png", buffer, { contentDelayMs: 3000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const midFlight = await api(`/projects/${project.id}`);
  check("subida lenta (1,5 s): el proyecto sigue con 0 pasos visibles", midFlight.scenes.length === 0, `${midFlight.scenes.length} escenas`);

  const asset = await slowAsset;
  mark("asset subido");
  const scene = await createScene(project.id, 1, "Captura de facturación", asset.id, "Principal");
  mark("escena creada");
  const committed = await api(`/projects/${project.id}`);
  mark("relectura autoritativa");

  check("1 imagen -> exactamente 1 paso", committed.scenes.length === 1, `${committed.scenes.length} escenas`);
  check("el paso quedó con media asociado", Boolean(committed.scenes[0]?.mediaAssetId), committed.scenes[0]?.mediaAssetId ?? "sin medio");
  check("la escena creada es la persistida", committed.scenes[0]?.id === scene.id);
  await deleteProject(project.id);

  // Lote de 5 imagenes.
  const batch = await createProject(false);
  const batchBuffer = await readFile(SAMPLE);
  const createdIds = [];
  for (let index = 0; index < 5; index += 1) {
    const item = await uploadAsset(batch.id, `captura-${index + 1}.png`, batchBuffer);
    const itemScene = await createScene(batch.id, index + 1, `Captura ${index + 1}`, item.id, "Contenido");
    createdIds.push(itemScene.id);
  }
  const batchAfter = await api(`/projects/${batch.id}`);
  const order = [...batchAfter.scenes].sort((a, b) => a.order - b.order).map((item) => item.id);
  check("5 imagenes -> exactamente 5 pasos", batchAfter.scenes.length === 5, `${batchAfter.scenes.length} escenas`);
  check("todos con media asociado", batchAfter.scenes.every((item) => Boolean(item.mediaAssetId)));
  check("sin duplicados", new Set(batchAfter.scenes.map((item) => item.id)).size === 5);
  check("orden == orden de creacion", JSON.stringify(order) === JSON.stringify(createdIds));
  await deleteProject(batch.id);

  const first = timeline[0].at;
  console.log("\nTIMELINE (ms desde 'archivo elegido')");
  for (const entry of timeline) console.log(`  T+${String(entry.at - first).padStart(5, " ")} ms  ${entry.label}`);

  const uploads = requests.filter((item) => item.method !== "GET");
  console.log("\nREQUESTS del flujo de 1 imagen");
  for (const item of requests.slice(0, 14)) console.log(`  ${item.status}  ${item.method.padEnd(6)} ${item.path}  ${item.ms} ms`);
  console.log(`\n  escrituras: ${uploads.length} | lecturas: ${requests.filter((item) => item.method === "GET").length}`);

  const failed = results.filter((item) => !item.pass);
  console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
