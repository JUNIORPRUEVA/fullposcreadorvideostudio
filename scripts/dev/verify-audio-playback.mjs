#!/usr/bin/env node
/*
 * Verificacion de reproduccion de audio del paso 4 (Voz y musica).
 *
 * Reproduce el escenario real del navegador: un elemento <audio> NO puede
 * enviar la cabecera Authorization. Para cada audio de la app se pide la URL
 * al API (con token) y despues se descarga SIN cabeceras; debe responder 200.
 *
 * Solo local. No modifica datos (los previews son archivos temporales).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const API = process.env.STUDIO_API_URL ?? "http://localhost:4000";
let token = "";

async function login() {
  const env = await readFile(path.join(ROOT, "apps", "api", ".env"), "utf8");
  const map = {};
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_]+)\s*=\s*(.*)$/.exec(line);
    if (match) map[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: map.OWNER_EMAIL, password: map.OWNER_PASSWORD })
  });
  if (!response.ok) throw new Error(`login HTTP ${response.status}`);
  token = (await response.json()).token;
}

async function api(pathname, init = {}) {
  const response = await fetch(`${API}${pathname}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

/* Exactamente lo que hace el navegador con <audio src="..."> */
async function withoutHeaders(url, label) {
  const response = await fetch(url.startsWith("http") ? url : `${API}${url}`);
  const bytes = (await response.arrayBuffer()).byteLength;
  const ok = response.ok && bytes > 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${response.status} ${response.headers.get("content-type")} ${bytes} bytes`);
  return ok;
}

async function main() {
  await login();
  const results = [];

  const voice = await api("/audio/voice-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Prueba de audio del paso cuatro.", voiceProfile: "dominican-promotional", speed: 1 })
  });
  results.push(await withoutHeaders(voice.url, "voz (Probar voz)"));
  results.push(!(await fetch(`${API}${voice.url.split("?")[0]}?sig=falsa&exp=99999999999`)).ok);
  console.log(`${results.at(-1) ? "PASS" : "FAIL"}  firma falsa rechazada`);

  const library = await api("/audio/music-library");
  const track = library[0];
  results.push(await withoutHeaders(track.url, `musica de biblioteca (${track.name})`));

  const mix = await api("/audio/mix-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Prueba de mezcla.", voiceProfile: "dominican-promotional", speed: 1, musicTrackId: track.id, musicVolume: 0.15, voiceVolume: 1 })
  });
  results.push(await withoutHeaders(mix.url, "voz + musica (Probar voz + musica)"));

  const projects = await api("/projects");
  const withMusic = projects.find((project) => project.customMusicUrl);
  if (withMusic) {
    results.push(await withoutHeaders(withMusic.customMusicUrl, `musica personalizada (${withMusic.name})`));
  } else {
    console.log("SKIP  musica personalizada: ningun proyecto tiene pista propia subida.");
  }

  const failed = results.filter((item) => !item).length;
  console.log(`\nRESULTADO: ${results.length - failed}/${results.length} PASS`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
