import type { VoiceOption } from "./voice-generation.service.js";

export type VoiceProfileId = "dominican-promotional" | "latin-professional" | "latin-warm";

export interface VoiceProfile {
  id: VoiceProfileId;
  label: string;
  description: string;
  preferredCultures: string[];
  speed: number;
}

export const voiceProfiles: VoiceProfile[] = [
  {
    id: "dominican-promotional",
    label: "Dominicana promocional",
    description: "Promocional, clara y energética. Usa fallback latino si no hay voz es-DO instalada.",
    preferredCultures: ["es-DO", "es-PR", "es-US", "es-419", "es-MX"],
    speed: 1.05
  },
  {
    id: "latin-professional",
    label: "Latina profesional",
    description: "Neutral, segura y corporativa para SaaS.",
    preferredCultures: ["es-419", "es-US", "es-MX", "es-PR", "es-DO"],
    speed: 1
  },
  {
    id: "latin-warm",
    label: "Latina cálida",
    description: "Más cercana y pausada, manteniendo claridad comercial.",
    preferredCultures: ["es-MX", "es-419", "es-US", "es-PR", "es-DO"],
    speed: 0.95
  }
];

export function findVoiceProfile(id?: string | null) {
  return voiceProfiles.find((profile) => profile.id === id) ?? voiceProfiles[0];
}

export function resolveProfileVoice(profileId: string | null | undefined, voices: VoiceOption[]) {
  const profile = findVoiceProfile(profileId);
  const femaleSpanish = voices.filter((voice) => voice.gender === "Female" && voice.culture.toLowerCase().startsWith("es"));
  const preferred = profile.preferredCultures
    .map((culture) => femaleSpanish.find((voice) => voice.culture.toLowerCase() === culture.toLowerCase()))
    .find(Boolean);
  return preferred ?? femaleSpanish[0] ?? voices.find((voice) => voice.culture.toLowerCase().startsWith("es")) ?? voices[0];
}
