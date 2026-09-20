import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderFullPosVideo } from "../packages/video/dist/index.js";

const root = process.cwd();
const renderId = "phase3-audio-test";
const audioDir = path.join(root, "storage", "audio", "voice", "phase3-audio-test", renderId);
await mkdir(audioDir, { recursive: true });

const voiceoverScript = "Con FullPOS Cloud tienes el control de tu negocio en un solo lugar. Factura rápidamente, administra tus productos y mantén tu inventario organizado. Consulta tus ventas y reportes para tomar mejores decisiones. Trabaja desde tu computadora, Android o iPhone, estés donde estés. Prueba FullPOS Cloud gratis por siete días.";
const voicePath = path.join(audioDir, "voiceover.wav");
const musicPath = path.join(root, "storage", "audio", "music", "phase3-audio-test", renderId, "background-music.wav");
await mkdir(path.dirname(musicPath), { recursive: true });

await synthesizeVoice(voiceoverScript, voicePath);
await writeFile(musicPath, createMusicBedWav(30, 0.09));

const asset = (name) => path.join(root, "assets", "demo", "e2e", name);

await renderFullPosVideo({
  projectId: "phase3-audio-test",
  template: "fullpos-premium-vertical",
  format: "9:16",
  fps: 30,
  durationSeconds: 30,
  brand: {
    name: "FullPOS Cloud",
    headline: "Tu negocio bajo control",
    subheadline: "Facturación, inventario y reportes en una sola plataforma.",
    offer: "7 DÍAS GRATIS",
    price: "Desde RD$1,000/mes",
    website: "fullposcloud.fulltechrd.com"
  },
  assets: {
    logo: asset("logo.png"),
    billing: asset("billing.png"),
    products: asset("products.png"),
    reports: asset("reports.png"),
    mobile: asset("mobile.png")
  },
  audio: {
    voiceoverEnabled: true,
    musicEnabled: true,
    voiceoverScript,
    voiceName: "Microsoft Sabina Desktop",
    voiceSpeed: 1,
    voiceOverPath: voicePath,
    musicPath,
    musicVolume: 0.2,
    voiceVolume: 1,
    voiceStartSeconds: 0.4
  },
  scenes: {
    billing: { scale: 1.22, y: -22, fit: "cover" },
    products: { scale: 1.25, y: -16, fit: "cover" },
    reports: { scale: 1.23, y: -16, fit: "cover" },
    mobile: { scale: 1.1, y: -26, fit: "cover" },
    devices: { scale: 1.08, y: -18, fit: "cover" }
  }
}, {
  renderId,
  outputRoot: path.join(root, "storage", "renders"),
  onProgress: (progress) => {
    if (progress % 10 === 0) console.log(`Phase 3A render: ${progress}%`);
  }
});

console.log("Phase 3A audio video generated.");

async function synthesizeVoice(text, outputPath) {
  const ps1 = path.join(path.dirname(outputPath), "synthesize-phase3a.ps1");
  const safeText = text.replaceAll("`", "``").replaceAll("$", "`$").replaceAll("\"", "`\"");
  const safeOutput = outputPath.replaceAll("'", "''");
  await writeFile(ps1, `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$voice = $voices | Where-Object { $_.Name -eq "Microsoft Sabina Desktop" } | Select-Object -First 1
if ($null -eq $voice) { $voice = $voices | Where-Object { $_.Gender -eq "Female" -and $_.Culture.Name -like "es*" } | Select-Object -First 1 }
if ($null -eq $voice) { throw "No female Spanish SAPI voice found." }
$synth.SelectVoice($voice.Name)
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile('${safeOutput}')
$synth.Speak("${safeText}")
$synth.Dispose()
`, "utf8");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], {
    encoding: "utf8",
    timeout: 45_000
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Voice synthesis failed.");
}

function createMusicBedWav(seconds, volume) {
  const sampleRate = 44_100;
  const channels = 2;
  const totalSamples = Math.floor(seconds * sampleRate);
  const dataSize = totalSamples * channels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 1.1, (seconds - t) / 2.2);
    const chord = Math.sin(2 * Math.PI * 196 * t) * 0.42 + Math.sin(2 * Math.PI * 246.94 * t) * 0.26 + Math.sin(2 * Math.PI * 329.63 * t) * 0.16;
    const sample = Math.max(-1, Math.min(1, chord * volume * Math.max(0, envelope)));
    const value = Math.round(sample * 32767);
    const offset = 44 + i * channels * 2;
    buffer.writeInt16LE(value, offset);
    buffer.writeInt16LE(value, offset + 2);
  }
  return buffer;
}
