import { spawnSync } from "node:child_process";
import type { GenerateVoiceRequest, VoiceOption } from "./voice-generation.service.js";
import type { VoiceProvider, VoiceProviderStatus } from "./voice-provider.js";

export class ChatterboxProvider implements VoiceProvider {
  readonly id = "chatterbox" as const;
  readonly label = "Chatterbox Multilingual";

  status(): VoiceProviderStatus {
    const python = spawnSync("python", ["--version"], { encoding: "utf8", timeout: 5_000 });
    const version = `${python.stdout}${python.stderr}`.trim();
    if (python.status !== 0) {
      return { id: this.id, label: this.label, available: false, reason: "Python is not available." };
    }
    if (/3\.15/.test(version)) {
      return { id: this.id, label: this.label, available: false, reason: `${version} is too new for the current PyTorch/Chatterbox stack.` };
    }
    const check = spawnSync("python", ["-c", "import chatterbox; print('ok')"], { encoding: "utf8", timeout: 10_000 });
    if (check.status !== 0) {
      return { id: this.id, label: this.label, available: false, reason: "chatterbox-tts is not installed." };
    }
    return { id: this.id, label: this.label, available: true };
  }

  listVoices(): VoiceOption[] {
    return [];
  }

  async generateVoice(_request: GenerateVoiceRequest): Promise<string> {
    throw new Error("Chatterbox provider is not installed on this workstation; using Windows SAPI fallback.");
  }
}
