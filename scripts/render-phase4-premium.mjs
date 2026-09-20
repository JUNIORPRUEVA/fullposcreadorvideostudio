import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderFullPosVideo } from "@fullpos-ad-studio/video";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderId = "phase4-premium";
const voiceDir = path.join(root, "storage", "audio", "voice", renderId);
const voicePath = path.join(voiceDir, "voiceover.wav");
const musicPath = path.join(root, "assets", "music", "inspiring-saas.wav");
const script = "Con FullPOS Cloud tienes el control de tu negocio estés donde estés. Factura de forma rápida, administra tus productos y mantén tu inventario organizado. Consulta tus ventas y reportes para tomar mejores decisiones. Trabaja desde tu computadora, Android o iPhone. FullPOS Cloud. Tu negocio bajo control. Pruébalo gratis por siete días.";

await mkdir(voiceDir, { recursive: true });
await synthesizeVoice(prepareTextForSpeech(script), voicePath);

await renderFullPosVideo(
  {
    projectId: renderId,
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
    assets: {},
    audio: {
      voiceoverEnabled: true,
      musicEnabled: true,
      voiceoverScript: script,
      voiceProfile: "dominican-promotional",
      voiceName: "Dominicana promocional",
      voiceOverPath: voicePath,
      voiceSpeed: 1.05,
      musicPath,
      musicVolume: 0.16,
      voiceVolume: 1,
      voiceStartSeconds: 0.4
    },
    scenes: {
      billing: { scale: 1.22, y: -22, fit: "cover" },
      products: { scale: 1.24, y: -16, fit: "cover" },
      reports: { scale: 1.22, y: -14, fit: "cover" },
      mobile: { scale: 1.1, y: -26, fit: "cover" },
      devices: { scale: 1.08, y: -18, fit: "cover" }
    },
    visual: {
      style: "technology-cinematic",
      motion: "cinematic"
    }
  },
  {
    renderId,
    outputRoot: path.join(root, "storage", "renders"),
    onProgress: (progress) => {
      if (progress % 10 === 0) console.log(`progress ${progress}%`);
    }
  }
);

function prepareTextForSpeech(text) {
  return text
    .replace(/\bRD\$\s*1[,.]?000\s*\/\s*mes\b/gi, "mil pesos dominicanos al mes")
    .replace(/\bRD\$\s*1[,.]?000\b/gi, "mil pesos dominicanos")
    .replace(/\b7\s+d[ií]as\s+gratis\b/gi, "siete días gratis")
    .replace(/\bFullPOS Cloud\b/gi, "Full Pos Cloud")
    .replace(/\bFullPOS\b/gi, "Full Pos")
    .replace(/\bAndroid\b/gi, "An-droid")
    .replace(/\biPhone\b/gi, "ai fon")
    .replace(/\bPC\b/g, "computadora")
    .replace(/\bPWA\b/g, "aplicación web progresiva")
    .replace(/\bsoftware\b/gi, "sóftwer");
}

async function synthesizeVoice(text, outputPath) {
  const ps1 = path.join(path.dirname(outputPath), "synthesize-phase4.ps1");
  const safeText = text.replaceAll("`", "``").replaceAll("$", "`$").replaceAll("\"", "`\"");
  const safeOutput = outputPath.replaceAll("'", "''");
  await writeFile(
    ps1,
    `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Culture.Name -eq "es-DO" -and $_.Gender -eq "Female" } | Select-Object -First 1
if ($null -eq $voice) { $voice = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Culture.Name -eq "es-PR" -and $_.Gender -eq "Female" } | Select-Object -First 1 }
if ($null -eq $voice) { $voice = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Culture.Name -eq "es-MX" -and $_.Gender -eq "Female" } | Select-Object -First 1 }
if ($null -eq $voice) { throw "No Spanish female SAPI voice found." }
$synth.SelectVoice($voice.Name)
$synth.Rate = 2
$synth.Volume = 100
$synth.SetOutputToWaveFile('${safeOutput}')
$synth.Speak("${safeText}")
$synth.Dispose()
`,
    "utf8"
  );
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { encoding: "utf8", timeout: 45_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "SAPI voice generation failed.");
}
