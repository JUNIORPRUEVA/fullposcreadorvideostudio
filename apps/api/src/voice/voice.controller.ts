import { Body, Controller, Get, Inject, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { authSecret } from "../auth/auth.service.js";
import { signMediaUrl } from "../lib/media-signature.js";
import { VoiceService } from "./voice.service.js";
import type { VoiceGeneration } from "./voice.types.js";

/* Igual que en audio.controller: un <audio> no puede enviar Authorization, asi que
 * las URLs que el navegador va a cargar se firman (HMAC + caducidad corta). */
function signed(pathname: string) {
  const secret = authSecret();
  return secret ? signMediaUrl(pathname, secret) : pathname;
}

function signGeneration(generation: VoiceGeneration): VoiceGeneration {
  const audioPath = generation.downloadUrl.replace(/\?download=1$/, "");
  return {
    ...generation,
    audioUrl: signed(generation.audioUrl),
    downloadUrl: `${signed(audioPath)}&download=1`,
    masterUrl: generation.masterUrl ? signed(generation.masterUrl) : null
  };
}

@Controller("voice")
export class VoiceController {
  constructor(@Inject(VoiceService) private readonly voice: VoiceService) {}

  /** Estado del motor local (nunca falla: explica el motivo si esta apagado). */
  @Get("health")
  health() {
    return this.voice.health();
  }

  /** Voces disponibles. */
  @Get("voices")
  voices() {
    return this.voice.voices();
  }

  /** Muestra corta de una voz. */
  @Post("preview")
  async preview(@Body() body: Record<string, unknown>) {
    return signGeneration(await this.voice.preview(body));
  }

  /** Narracion completa (trocea, une y guarda WAV/MP3). */
  @Post("generate")
  async generate(@Body() body: Record<string, unknown>) {
    return signGeneration(await this.voice.generate(body));
  }

  /** Voz FullPOS guardada. */
  @Get("voice-preference")
  preference() {
    return this.voice.getPreference();
  }

  /**
   * Abre la carpeta local de audios en el explorador de Windows.
   * El navegador no manda rutas: solo puede pedir la raiz o una carpeta de fecha.
   */
  @Post("open-folder")
  openFolder(@Body() body: Record<string, unknown>) {
    return this.voice.openGeneratedAudioFolder(body ?? {});
  }

  @Put("voice-preference")
  savePreference(@Body() body: Record<string, unknown>) {
    return this.voice.savePreference(body);
  }

  /** Reproduccion y descarga del audio generado. */
  @Get("files/:folder/:name")
  file(
    @Param("folder") folder: string,
    @Param("name") name: string,
    @Query("download") download: string | undefined,
    @Res() response: Response
  ) {
    const file = this.voice.resolveAudioFile(folder, name);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Cache-Control", "private, max-age=3600");
    if (download === "1" || download === "true") {
      response.setHeader("Content-Disposition", `attachment; filename="${file.downloadName}"`);
    }
    return response.sendFile(file.path);
  }
}
