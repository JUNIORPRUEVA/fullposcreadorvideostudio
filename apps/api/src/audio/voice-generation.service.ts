import { Injectable } from "@nestjs/common";
import { ChatterboxProvider } from "./chatterbox-provider.js";
import type { VoiceProviderStatus } from "./voice-provider.js";
import { WindowsSapiProvider } from "./windows-sapi-provider.js";
import { resolveProfileVoice, voiceProfiles } from "./voice-profiles.js";

export interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  culture: string;
  works: boolean;
}

export interface GenerateVoiceRequest {
  text: string;
  language: "es";
  voice: string;
  voiceProfile?: string | null;
  voiceReferencePath?: string | null;
  pace?: number;
  temperature?: number;
  cfgWeight?: number;
  exaggeration?: number;
  speed: number;
  outputPath: string;
  pronunciationDictionary?: Array<{ writtenText: string; spokenText: string }>;
}

@Injectable()
export class VoiceGenerationService {
  private readonly chatterbox = new ChatterboxProvider();
  private readonly sapi = new WindowsSapiProvider();

  providerStatus(): VoiceProviderStatus[] {
    return [this.chatterbox.status(), this.sapi.status()];
  }

  listVoices(): VoiceOption[] {
    return this.sapi.listVoices();
  }

  listVoiceProfiles() {
    const voices = this.listVoices();
    return voiceProfiles.map((profile) => {
      const voice = resolveProfileVoice(profile.id, voices);
      return {
        ...profile,
        voiceId: voice?.id,
        voiceName: voice?.name,
        culture: voice?.culture,
        available: Boolean(voice)
      };
    });
  }

  async generateVoice(request: GenerateVoiceRequest) {
    if (this.chatterbox.status().available) {
      return this.chatterbox.generateVoice(request);
    }
    return this.sapi.generateVoice(request);
  }

  resolveVoice(voice: string, profileId?: string | null) {
    return this.sapi.resolveVoice(voice, profileId);
  }
}
