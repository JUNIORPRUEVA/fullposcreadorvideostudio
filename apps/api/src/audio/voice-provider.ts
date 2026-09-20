import type { GenerateVoiceRequest, VoiceOption } from "./voice-generation.service.js";

export interface VoiceProviderStatus {
  id: "chatterbox" | "windows-sapi";
  label: string;
  available: boolean;
  reason?: string;
}

export interface VoiceProvider {
  readonly id: VoiceProviderStatus["id"];
  readonly label: string;
  status(): VoiceProviderStatus;
  listVoices(): VoiceOption[];
  generateVoice(request: GenerateVoiceRequest): Promise<string>;
}
