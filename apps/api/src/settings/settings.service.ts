import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const SETTINGS_KEY = "studio";

const defaultSettings = {
  defaultVoiceName: "female-es",
  voiceoverEnabled: true,
  musicEnabled: true,
  musicVolume: 0.2,
  voiceVolume: 1
};

@Injectable()
export class SettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get() {
    const stored = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!stored) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(stored.value) };
  }

  async save(body: Record<string, unknown>) {
    const current = await this.get();
    const next = {
      ...current,
      defaultVoiceName: cleanString(body.defaultVoiceName, current.defaultVoiceName),
      voiceoverEnabled: cleanBoolean(body.voiceoverEnabled, current.voiceoverEnabled),
      musicEnabled: cleanBoolean(body.musicEnabled, current.musicEnabled),
      musicVolume: cleanNumber(body.musicVolume, current.musicVolume),
      voiceVolume: cleanNumber(body.voiceVolume, current.voiceVolume)
    };
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) }
    });
    return next;
  }
}

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function cleanBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
