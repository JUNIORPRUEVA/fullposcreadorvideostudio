import { Module } from "@nestjs/common";
import { ProjectsController } from "../projects/projects.controller.js";
import { ProjectsService } from "../projects/projects.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RendersController } from "../renders/renders.controller.js";
import { RenderService } from "../renders/render.service.js";
import { AudioService } from "../audio/audio.service.js";
import { AudioController } from "../audio/audio.controller.js";
import { VoiceGenerationService } from "../audio/voice-generation.service.js";
import { VoiceController } from "../voice/voice.controller.js";
import { VoiceService } from "../voice/voice.service.js";
import { VoiceEngineClient } from "../voice/voice-engine.client.js";
import { SettingsController } from "../settings/settings.controller.js";
import { SettingsService } from "../settings/settings.service.js";
import { AiVideoController } from "../ai-video/ai-video.controller.js";
import { AiVideoService } from "../ai-video/ai-video.service.js";
import { TemporaryTunnelAiAssetTransport } from "../ai-video/ai-asset-transport.js";
import { AiAssetGatewayService } from "../ai-video/ai-asset-gateway.service.js";
import { RunpodPublicVideoProvider } from "../ai-video/runpod-public-video.provider.js";
import { R2SignedUrlAiAssetTransport } from "../ai-video/r2-signed-url-ai-asset-transport.js";
import { CompositeAiAssetTransport } from "../ai-video/composite-ai-asset-transport.js";
import { VideoStudioController } from "../video-studio/video-studio.controller.js";
import { BrandsController } from "../brands/brands.controller.js";
import { BrandsService } from "../brands/brands.service.js";
import { HealthController } from "../health/health.controller.js";
import { AuthController } from "../auth/auth.controller.js";
import { AuthService } from "../auth/auth.service.js";
import { R2StorageService } from "../storage/r2-storage.service.js";
import { DiskGuardService } from "../storage/disk-guard.service.js";

@Module({
  controllers: [HealthController, AuthController, ProjectsController, RendersController, SettingsController, AudioController, AiVideoController, VideoStudioController, BrandsController, VoiceController],
  providers: [PrismaService, AuthService, ProjectsService, RenderService, AudioService, VoiceGenerationService, SettingsService, AiVideoService, AiAssetGatewayService, TemporaryTunnelAiAssetTransport, R2SignedUrlAiAssetTransport, CompositeAiAssetTransport, RunpodPublicVideoProvider, BrandsService, R2StorageService, DiskGuardService, VoiceService, VoiceEngineClient]
})
export class AppModule {}
