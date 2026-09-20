import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { audioRoot, projectRoot } from "../lib/paths.js";
import { AudioService } from "./audio.service.js";
import { VoiceGenerationService } from "./voice-generation.service.js";

@Controller("audio")
export class AudioController {
  constructor(
    @Inject(AudioService) private readonly audio: AudioService,
    @Inject(VoiceGenerationService) private readonly voices: VoiceGenerationService
  ) {}

  @Get("voices")
  listVoices() {
    return this.voices.listVoices();
  }

  @Get("voice-providers")
  listVoiceProviders() {
    return this.voices.providerStatus();
  }

  @Get("voice-profiles")
  listVoiceProfiles() {
    return this.voices.listVoiceProfiles();
  }

  @Get("music-library")
  listMusicLibrary() {
    return this.audio.listMusicLibrary();
  }

  @Get("music/:id/file")
  async musicFile(@Param("id") id: string, @Res() response: Response) {
    const track = (await this.audio.listMusicLibrary()).find((item) => item.id === id);
    if (!track) throw new NotFoundException("Music track not found.");
    const file = path.join(projectRoot, "assets", "music", track.filename);
    if (!existsSync(file)) throw new NotFoundException("Music track file not found.");
    response.setHeader("Content-Type", contentTypeFor(file));
    return response.sendFile(file);
  }

  @Post("voice-preview")
  preview(@Body() body: Record<string, unknown>) {
    const text = typeof body.text === "string" && body.text.trim() ? body.text.trim().slice(0, 240) : "Presenta tu marca con una voz clara, cercana y profesional.";
    const voice = typeof body.voice === "string" ? body.voice : "";
    const voiceProfile = typeof body.voiceProfile === "string" ? body.voiceProfile : "dominican-promotional";
    const speed = typeof body.speed === "number" ? Math.max(0.9, Math.min(1.1, body.speed)) : 1;
    return this.audio.createPreview({ text, voice, voiceProfile, speed });
  }

  @Post("mix-preview")
  mixPreview(@Body() body: Record<string, unknown>) {
    const text = typeof body.text === "string" && body.text.trim() ? body.text.trim().slice(0, 360) : "Presenta tu marca con un video claro, moderno y profesional.";
    return this.audio.createMixPreview({
      text,
      voice: typeof body.voice === "string" ? body.voice : "",
      voiceProfile: typeof body.voiceProfile === "string" ? body.voiceProfile : "dominican-promotional",
      speed: typeof body.speed === "number" ? Math.max(0.9, Math.min(1.1, body.speed)) : 1,
      voiceVolume: typeof body.voiceVolume === "number" ? Math.max(0, Math.min(1, body.voiceVolume)) : 1,
      musicTrackId: typeof body.musicTrackId === "string" ? body.musicTrackId : undefined,
      musicPath: typeof body.musicPath === "string" ? body.musicPath : undefined,
      customMusicPath: typeof body.customMusicPath === "string" ? body.customMusicPath : undefined,
      musicVolume: typeof body.musicVolume === "number" ? Math.max(0, Math.min(1, body.musicVolume)) : 0.15
    });
  }

  @Get("previews/:id/file")
  previewFile(@Param("id") id: string, @Res() response: Response) {
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    const file = path.join(audioRoot, "voice", "previews", `${safeId}.wav`);
    if (!existsSync(file)) throw new NotFoundException("Voice preview not found.");
    response.setHeader("Content-Type", "audio/wav");
    return response.sendFile(file);
  }

  @Get("mix-previews/:id/file")
  mixPreviewFile(@Param("id") id: string, @Res() response: Response) {
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    const file = path.join(audioRoot, "mix", "previews", safeId, "preview.wav");
    const fallback = path.join(audioRoot, "mix", "previews", safeId, "voice.wav");
    const target = existsSync(file) ? file : fallback;
    if (!existsSync(target)) throw new NotFoundException("Mix preview not found.");
    response.setHeader("Content-Type", "audio/wav");
    return response.sendFile(target);
  }
}

function contentTypeFor(file: string) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  return "audio/wav";
}
