import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { audioRoot, assertInside } from "../lib/paths.js";
import { prepareTextForSpeech } from "./pronunciation.js";
import type { GenerateVoiceRequest, VoiceOption } from "./voice-generation.service.js";
import { resolveProfileVoice } from "./voice-profiles.js";
import type { VoiceProvider, VoiceProviderStatus } from "./voice-provider.js";

export class WindowsSapiProvider implements VoiceProvider {
  readonly id = "windows-sapi" as const;
  readonly label = "Windows SAPI";

  status(): VoiceProviderStatus {
    return { id: this.id, label: this.label, available: this.listVoices().length > 0 };
  }

  listVoices(): VoiceOption[] {
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Gender + '|' + $_.VoiceInfo.Culture.Name }"
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      encoding: "utf8",
      timeout: 15_000
    });
    if (result.status !== 0) return [];
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, gender, culture] = line.split("|");
        return { id: name, name, gender, culture, works: culture.toLowerCase().startsWith("es") };
      })
      .filter((voice) => voice.works);
  }

  async generateVoice(request: GenerateVoiceRequest) {
    const outputPath = path.resolve(request.outputPath);
    assertInside(path.join(audioRoot, "voice"), outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    const scriptPath = path.join(path.dirname(outputPath), "synthesize-voiceover.ps1");
    const speechText = prepareTextForSpeech(request.text, request.pronunciationDictionary);
    const safeText = speechText.replaceAll("`", "``").replaceAll("$", "`$").replaceAll("\"", "`\"");
    const safeOutput = outputPath.replaceAll("'", "''");
    const safeVoice = this.resolveVoice(request.voice, request.voiceProfile).replaceAll("'", "''");
    const ps1 = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('${safeVoice}')
$synth.Rate = ${speedToSapiRate(request.speed)}
$synth.Volume = 100
$synth.SetOutputToWaveFile('${safeOutput}')
$synth.Speak("${safeText}")
$synth.Dispose()
`;
    await writeFile(scriptPath, ps1, "utf8");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      encoding: "utf8",
      timeout: 45_000
    });
    if (result.status !== 0 || !existsSync(outputPath)) {
      throw new Error((result.stderr || result.stdout || "Local voice generation failed.").trim());
    }
    return outputPath;
  }

  resolveVoice(voice: string, profileId?: string | null) {
    const voices = this.listVoices();
    if (voice && voices.some((item) => item.id === voice)) return voice;
    const profileVoice = resolveProfileVoice(profileId, voices);
    if (profileVoice) return profileVoice.id;
    const female = voices.find((item) => item.gender === "Female");
    const first = female ?? voices[0];
    if (!first) throw new Error("No local Spanish SAPI voice is installed.");
    return first.id;
  }
}

function speedToSapiRate(speed: number) {
  if (speed <= 0.92) return -2;
  if (speed < 1) return -1;
  if (speed >= 1.05) return 2;
  return 0;
}
