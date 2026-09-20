import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AiVideoJob } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { AiAssetGatewayService } from "./ai-asset-gateway.service.js";
import { CompositeAiAssetTransport } from "./composite-ai-asset-transport.js";
import { R2SignedUrlAiAssetTransport } from "./r2-signed-url-ai-asset-transport.js";
import { r2EnvPresence } from "./r2-env.js";
import { aiSceneTemplates, aiVideoProfiles, AI_VIDEO_PROVIDER, MAX_AI_SCENES_PER_PROJECT, getAiScene, getAiVideoProfile } from "./ai-video.profiles.js";
import { validateAiVideoRequest, validateCostConfirmation } from "./ai-video.validation.js";
import { downloadAiVideo } from "./ai-video-storage.js";
import { RunpodPublicVideoProvider } from "./runpod-public-video.provider.js";

@Injectable()
export class AiVideoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CompositeAiAssetTransport) private readonly assetTransport: CompositeAiAssetTransport,
    @Inject(R2SignedUrlAiAssetTransport) private readonly r2Transport: R2SignedUrlAiAssetTransport,
    @Inject(AiAssetGatewayService) private readonly gateway: AiAssetGatewayService,
    @Inject(RunpodPublicVideoProvider) private readonly provider: RunpodPublicVideoProvider
  ) {}

  profiles() {
    return {
      provider: AI_VIDEO_PROVIDER,
      maxDuration: 5,
      maxAiScenesPerProject: MAX_AI_SCENES_PER_PROJECT,
      profiles: Object.values(aiVideoProfiles),
      scenes: Object.entries(aiSceneTemplates).map(([id, scene]) => ({ id, ...scene }))
    };
  }

  async transportStatus() {
    const gateway = await this.gateway.status();
    return {
      ...gateway,
      preferredProvider: this.assetTransport.preferredProvider(),
      r2Configured: this.r2Transport.isConfigured(),
      r2Env: r2EnvPresence()
    };
  }

  prepareTransport() {
    return this.gateway.prepare();
  }

  stopTransport() {
    return this.gateway.stop();
  }

  async jobs(projectId: string) {
    await this.findProject(projectId);
    return this.prisma.aiVideoJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  }

  async quote(projectId: string, body: Record<string, unknown>) {
    const project = await this.findProject(projectId);
    const input = validateAiVideoRequest(body);
    const profile = getAiVideoProfile(input.profile);
    const scene = getAiScene(input.scene);
    const prompt = buildPrompt(scene.prompt, input.prompt);
    const transport = await this.assetTransport.prepareImage(project.id, input.scene, project.assets);

    return {
      provider: AI_VIDEO_PROVIDER,
      model: profile.model,
      profile: profile.id,
      scene: input.scene,
      sceneLabel: scene.label,
      resolution: profile.resolution,
      duration: profile.duration,
      estimatedCost: profile.estimatedCost,
      prompt,
      requiresConfirmation: true,
      canGenerateNow: transport.ok,
      imageStrategy: transport.ok ? this.assetTransport.preferredProvider() : "local-dev-blocked",
      blocker: transport.ok ? undefined : transport.reason,
      expiresAt: transport.expiresAt,
      contentType: transport.contentType,
      contentLength: transport.contentLength,
      sha256Match: transport.localSha256 && transport.downloadedSha256 ? transport.localSha256 === transport.downloadedSha256 : undefined
    };
  }

  async generate(projectId: string, body: Record<string, unknown>) {
    const project = await this.findProject(projectId);
    const input = validateAiVideoRequest(body);
    validateCostConfirmation(input.confirmCost === true);

    const existingScenes = await this.prisma.aiVideoJob.groupBy({
      by: ["scene"],
      where: { projectId, status: { not: "FAILED" } }
    });
    if (!existingScenes.some((item) => item.scene === input.scene) && existingScenes.length >= MAX_AI_SCENES_PER_PROJECT) {
      throw new BadRequestException(`Máximo ${MAX_AI_SCENES_PER_PROJECT} escenas IA por proyecto.`);
    }

    const active = await this.prisma.aiVideoJob.findFirst({
      where: { projectId, status: { in: ["QUEUED", "RUNNING", "DOWNLOADING"] } }
    });
    if (active) {
      throw new BadRequestException("Ya hay una generación IA en proceso para este proyecto.");
    }

    const profile = getAiVideoProfile(input.profile);
    const scene = getAiScene(input.scene);
    const prompt = buildPrompt(scene.prompt, input.prompt);
    const transport = await this.assetTransport.prepareImage(project.id, input.scene, project.assets);
    const job = await this.prisma.aiVideoJob.create({
      data: {
        projectId,
        scene: input.scene,
        provider: AI_VIDEO_PROVIDER,
        model: profile.model,
        profile: profile.id,
        status: transport.ok ? "READY_FOR_RUNPOD_DRY_RUN" : "BLOCKED_INPUT_IMAGE",
        prompt,
        imageUrl: this.assetTransport.preferredProvider() === "temporary-tunnel" ? transport.imageUrl : undefined,
        localImagePath: transport.localPath,
        r2ObjectKey: transport.objectKey,
        inputUrlExpiresAt: transport.expiresAt ? new Date(transport.expiresAt) : undefined,
        estimatedCost: profile.estimatedCost,
        duration: profile.duration,
        resolution: profile.resolution,
        seed: input.seed,
        errorMessage: transport.ok ? undefined : transport.reason
      }
    });

    if (!transport.ok || !transport.imageUrl) {
      return {
        job,
        charged: false,
        realRunpodRequestMade: false,
        message: "Generación IA preparada, pero bloqueada porque falta una URL pública descargable para la imagen. No se hizo llamada a RunPod."
      };
    }

    const allowRealRunpod = process.env.RUNPOD_ENABLE_REAL_REQUESTS === "true" && body.allowRealRunpod === true;
    if (!allowRealRunpod) {
      if (transport.objectKey) await this.cleanupR2Object(transport.objectKey);
      return {
        job,
        charged: false,
        realRunpodRequestMade: false,
        message: "URL temporal lista y validable. Fase 5B se detiene antes de llamar RunPod; no hubo cobro."
      };
    }

    return this.runAndDownload(job, transport.imageUrl, profile, input.motion);
  }

  async findJob(projectId: string, jobId: string) {
    const job = await this.prisma.aiVideoJob.findFirst({ where: { id: jobId, projectId } });
    if (!job) throw new NotFoundException("AI video job not found.");
    return job;
  }

  private async runAndDownload(job: AiVideoJob, imageUrl: string, profile: ReturnType<typeof getAiVideoProfile>, motion: "elegant" | "cinematic" | "dynamic") {
    try {
      await this.prisma.aiVideoJob.update({ where: { id: job.id }, data: { status: "RUNNING" } });
      const result = await this.provider.generateImageToVideo({
        imageUrl,
        prompt: job.prompt,
        profile,
        duration: 5,
        motion,
        seed: job.seed ?? undefined
      });
      await this.prisma.aiVideoJob.update({
        where: { id: job.id },
        data: { status: "DOWNLOADING", videoUrl: result.videoUrl, reportedCost: result.cost }
      });
      if (!result.videoUrl) throw new Error("RunPod no devolvió videoUrl.");
      const outputPath = await downloadAiVideo(job.projectId, job.id, result.videoUrl);
      const completed = await this.prisma.aiVideoJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", outputPath, completedAt: new Date() }
      });
      return { job: completed, charged: true, realRunpodRequestMade: true };
    } catch (error) {
      const failed = await this.prisma.aiVideoJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Error IA inesperado.", completedAt: new Date() }
      });
      return { job: failed, charged: false, realRunpodRequestMade: true };
    } finally {
      if (job.r2ObjectKey) await this.cleanupR2Object(job.r2ObjectKey);
    }
  }

  private async cleanupR2Object(objectKey: string) {
    try {
      await this.r2Transport.deleteObject(objectKey);
    } catch {
      // Cleanup is best-effort and intentionally avoids logging credentials or signed URLs.
    }
  }

  private async findProject(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { assets: true } });
    if (!project) throw new NotFoundException("Project not found.");
    return project;
  }
}

function buildPrompt(base: string, custom: string) {
  const trimmed = custom.trim();
  return trimmed ? `${base}\n\nDirección adicional: ${trimmed}` : base;
}
