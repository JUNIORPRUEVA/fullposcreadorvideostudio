import { Inject, Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { audioRoot, assertInside, projectRoot } from "../lib/paths.js";
import { VoiceGenerationService } from "./voice-generation.service.js";
import { findVoiceProfile } from "./voice-profiles.js";

export interface AudioRequest {
  jobId: string;
  projectId: string;
  voiceoverEnabled: boolean;
  voiceoverScript?: string | null;
  voiceProfile?: string | null;
  voiceId?: string | null;
  voiceReferencePath?: string | null;
  voiceName?: string | null;
  voiceSpeed: number;
  voiceVolume: number;
  musicEnabled: boolean;
  musicTrackId?: string | null;
  musicPath?: string | null;
  customMusicPath?: string | null;
  musicVolume: number;
  durationSeconds: number;
  pronunciationDictionary?: Array<{ writtenText: string; spokenText: string }>;
}

export interface PreparedAudio {
  voiceoverPath?: string;
  musicPath?: string;
  note?: string;
}

@Injectable()
export class AudioService {
  constructor(@Inject(VoiceGenerationService) private readonly voiceGeneration: VoiceGenerationService) {}

  async listMusicLibrary() {
    return readMusicLibrary();
  }

  async prepare(request: AudioRequest): Promise<PreparedAudio> {
    const notes: string[] = [];
    let voiceoverPath: string | undefined;
    let musicPath: string | undefined;

    if (request.musicEnabled) {
      musicPath = await this.prepareMusic(request);
    }

    if (request.voiceoverEnabled && request.voiceoverScript?.trim()) {
      const target = path.join(audioRoot, "voice", request.projectId, request.jobId, "voiceover.wav");
      try {
        voiceoverPath = await this.voiceGeneration.generateVoice({
          text: request.voiceoverScript.trim(),
          language: "es",
          voice: request.voiceId ?? request.voiceName ?? "",
          voiceProfile: request.voiceProfile,
          voiceReferencePath: request.voiceReferencePath,
          speed: request.voiceSpeed,
          pronunciationDictionary: request.pronunciationDictionary,
          outputPath: target
        });
      } catch (error) {
        const scriptPath = path.join(audioRoot, "voice", request.projectId, request.jobId, "voiceover-script.txt");
        assertInside(path.join(audioRoot, "voice"), scriptPath);
        await mkdir(path.dirname(scriptPath), { recursive: true });
        await writeFile(scriptPath, request.voiceoverScript.trim(), "utf8");
        notes.push(error instanceof Error ? error.message : "Voiceover script saved, but local TTS failed.");
      }
    }

    return { voiceoverPath, musicPath, note: notes.join(" ") || undefined };
  }

  async createPreview(request: { text: string; voice?: string; voiceProfile?: string | null; speed: number }) {
    const id = `preview-${Date.now()}`;
    const outputPath = path.join(audioRoot, "voice", "previews", `${id}.wav`);
    const profile = findVoiceProfile(request.voiceProfile);
    await this.voiceGeneration.generateVoice({
      text: request.text.slice(0, 360),
      language: "es",
      voice: request.voice ?? "",
      voiceProfile: profile.id,
      speed: request.speed || profile.speed,
      outputPath
    });
    return { id, outputPath, url: `/audio/previews/${id}/file` };
  }

  async createMixPreview(request: {
    text: string;
    voice?: string;
    voiceProfile?: string | null;
    speed: number;
    voiceVolume: number;
    musicTrackId?: string | null;
    musicPath?: string | null;
    customMusicPath?: string | null;
    musicVolume: number;
  }) {
    const id = `mix-${Date.now()}`;
    const outputDir = path.join(audioRoot, "mix", "previews", id);
    const voicePath = path.join(audioRoot, "voice", "previews", `${id}-voice.wav`);
    const outputPath = path.join(outputDir, "preview.wav");
    await mkdir(outputDir, { recursive: true });
    const phrase = request.text.trim() || "Presenta tu marca con un video claro, moderno y profesional.";
    const voice = await this.createPreviewVoiceFile({
      text: phrase.slice(0, 280),
      voice: request.voice,
      voiceProfile: request.voiceProfile,
      speed: request.speed,
      outputPath: voicePath
    });
    const musicPath = await this.resolveMusicSource({
      musicTrackId: request.musicTrackId,
      musicPath: request.musicPath,
      customMusicPath: request.customMusicPath
    });
    if (!musicPath || !musicPath.toLowerCase().endsWith(".wav")) {
      await copyFile(voice, outputPath);
      return { id, outputPath, url: `/audio/mix-previews/${id}/file`, note: "Mix preview requires a WAV music source; voice preview generated." };
    }
    await writeFile(outputPath, mixWavFiles(voice, musicPath, 12, request.voiceVolume, request.musicVolume));
    return { id, outputPath, url: `/audio/mix-previews/${id}/file` };
  }

  private async createPreviewVoiceFile(request: { text: string; voice?: string; voiceProfile?: string | null; speed: number; outputPath: string }) {
    const profile = findVoiceProfile(request.voiceProfile);
    await this.voiceGeneration.generateVoice({
      text: request.text,
      language: "es",
      voice: request.voice ?? "",
      voiceProfile: profile.id,
      speed: request.speed || profile.speed,
      outputPath: request.outputPath
    });
    return request.outputPath;
  }

  private async prepareMusic(request: AudioRequest) {
    const outputDir = path.join(audioRoot, "music", request.projectId, request.jobId);
    assertInside(path.join(audioRoot, "music"), outputDir);
    await mkdir(outputDir, { recursive: true });
    const source = await this.resolveMusicSource(request);
    if (source && existsSync(source)) {
      const extension = path.extname(source) || ".wav";
      const target = path.join(outputDir, `background-music${extension}`);
      if (source.toLowerCase().endsWith(".wav")) {
        await copyFile(source, target);
        return target;
      }
      return source;
    }
    const target = path.join(outputDir, "background-music.wav");
    await writeFile(target, createMusicBedWav(request.durationSeconds, 0.09));
    return target;
  }

  private async resolveMusicSource(request: Pick<AudioRequest, "musicTrackId" | "musicPath" | "customMusicPath">) {
    if (request.musicTrackId) {
      const track = (await readMusicLibrary()).find((item) => item.id === request.musicTrackId);
      if (track) {
        const source = path.join(projectRoot, "assets", "music", track.filename);
        assertInside(path.join(projectRoot, "assets", "music"), source);
        if (existsSync(source)) return source;
      }
    }
    const custom = request.customMusicPath ?? request.musicPath;
    if (custom) {
      const source = path.resolve(custom);
      assertInside(path.join(audioRoot, "music"), source);
      if (existsSync(source)) return source;
    }
    return undefined;
  }
}

export interface MusicTrack {
  id: string;
  name: string;
  category: string;
  mood: string;
  filename: string;
  duration: number;
  license: string;
  source: string;
}

export async function readMusicLibrary(): Promise<MusicTrack[]> {
  const libraryPath = path.join(projectRoot, "assets", "music", "library.json");
  if (!existsSync(libraryPath)) return [];
  const content = await readFile(libraryPath, "utf8");
  return JSON.parse(content) as MusicTrack[];
}

export function createMusicBedWav(seconds: number, volume: number) {
  const sampleRate = 44_100;
  const channels = 2;
  const bitsPerSample = 16;
  const totalSamples = Math.floor(seconds * sampleRate);
  const dataSize = totalSamples * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 1.1, (seconds - t) / 2.2);
    const chord =
      Math.sin(2 * Math.PI * 196 * t) * 0.42 +
      Math.sin(2 * Math.PI * 246.94 * t) * 0.26 +
      Math.sin(2 * Math.PI * 329.63 * t) * 0.16;
    const pulse = Math.sin(2 * Math.PI * 98 * t) * 0.07;
    const sample = Math.max(-1, Math.min(1, (chord + pulse) * volume * Math.max(0, envelope)));
    const value = Math.round(sample * 32767);
    const offset = 44 + i * channels * 2;
    buffer.writeInt16LE(value, offset);
    buffer.writeInt16LE(value, offset + 2);
  }

  return buffer;
}

function readPcm16Wav(buffer: Buffer) {
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bits = buffer.readUInt16LE(34);
  if (bits !== 16) throw new Error("Only 16-bit WAV files are supported for mix preview.");
  const dataIndex = buffer.indexOf("data");
  if (dataIndex < 0) throw new Error("WAV data chunk not found.");
  const dataStart = dataIndex + 8;
  const sampleCount = Math.floor((buffer.length - dataStart) / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) samples[i] = buffer.readInt16LE(dataStart + i * 2);
  return { channels, sampleRate, samples };
}

function mixWavFiles(voicePath: string, musicPath: string, seconds: number, voiceVolume: number, musicVolume: number) {
  const voice = readPcm16Wav(requireRead(voicePath));
  const music = readPcm16Wav(requireRead(musicPath));
  const sampleRate = 44_100;
  const channels = 2;
  const totalSamples = sampleRate * seconds * channels;
  const dataSize = totalSamples * 2;
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
    const frame = Math.floor(i / channels);
    const t = frame / sampleRate;
    const fadeIn = Math.min(1, t / 0.7);
    const fadeOut = Math.min(1, (seconds - t) / 1);
    const voiceSample = sampleAt(voice, i, sampleRate) * voiceVolume;
    const duck = Math.abs(voiceSample) > 600 ? 0.45 : 0.82;
    const musicSample = sampleAt(music, i, sampleRate) * musicVolume * duck * fadeIn * fadeOut;
    const mixed = Math.max(-32768, Math.min(32767, Math.round(voiceSample + musicSample)));
    buffer.writeInt16LE(mixed, 44 + i * 2);
  }
  return buffer;
}

function sampleAt(wav: ReturnType<typeof readPcm16Wav>, index: number, targetRate: number) {
  const targetChannel = index % 2;
  const targetFrame = Math.floor(index / 2);
  const sourceFrame = Math.floor(targetFrame * (wav.sampleRate / targetRate));
  const sourceChannel = Math.min(targetChannel, wav.channels - 1);
  const sourceIndex = (sourceFrame * wav.channels + sourceChannel) % wav.samples.length;
  return wav.samples[sourceIndex] ?? 0;
}

function requireRead(file: string) {
  return existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
}
