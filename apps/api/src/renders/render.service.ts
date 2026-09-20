import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { renderFullPosVideo, renderHybridMobilePreview, renderProfessionalCoursePreview, renderQuickTutorialPreview } from "@fullpos-ad-studio/video";
import type { AssetType, RenderPayload } from "@fullpos-ad-studio/shared";
import { rename } from "node:fs/promises";
import path from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { rendersRoot } from "../lib/paths.js";
import { AudioService } from "../audio/audio.service.js";

@Injectable()
export class RenderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AudioService) private readonly audio: AudioService
  ) {}

  async enqueue(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { assets: true }
    });
    if (!project) throw new NotFoundException("Project not found.");

    const job = await this.prisma.renderJob.create({
      data: {
        projectId,
        status: "QUEUED",
        progress: 0
      }
    });

    void this.run(job.id).catch(async (error: unknown) => {
      await this.prisma.renderJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown render error.",
          completedAt: new Date()
        }
      });
    });

    return job;
  }

  findOne(id: string) {
    return this.prisma.renderJob.findUnique({ where: { id } });
  }

  findAll() {
    return this.prisma.renderJob.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            productName: true
          }
        }
      }
    });
  }

  async renderStylePreview(body: Record<string, unknown>) {
    const renderId = `style-preview-${Date.now()}`;
    const visualStyle = typeof body.visualStyle === "string" ? body.visualStyle : "saas-premium";
    const motionIntensity = typeof body.motionIntensity === "string" ? body.motionIntensity : "cinematic";
    const outputPath = await renderFullPosVideo(
      {
        projectId: renderId,
        template: "fullpos-premium-vertical",
        format: "9:16",
        fps: 30,
        durationSeconds: 8,
        brand: {
          name: "Demo Brand",
          headline: "Tu video profesional en minutos",
          subheadline: "Muestra tu producto, servicio o capacitación con una composición clara.",
          offer: "Demo visual",
          price: "",
          website: "demo-brand.example"
        },
        assets: {},
        audio: { voiceoverEnabled: false, musicEnabled: false },
        scenes: {
          billing: { scale: 1.18, y: -18, fit: "cover" },
          products: { scale: 1.22, y: -12, fit: "cover" },
          reports: { scale: 1.2, y: -10, fit: "cover" },
          mobile: { scale: 1.08, y: -24, fit: "cover" },
          devices: { scale: 1.05, y: -16, fit: "cover" }
        },
        visual: { style: visualStyle, motion: motionIntensity }
      },
      { renderId, outputRoot: rendersRoot }
    );
    return { id: renderId, outputPath, streamUrl: `/renders/style-preview/${renderId}/stream` };
  }

  async renderHybridPreview(body: Record<string, unknown>) {
    const renderId = "hybrid-mobile-preview";
    const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const project = projectId
      ? await this.prisma.project.findUnique({ where: { id: projectId }, include: { assets: true, brandProfile: true } })
      : null;
    const brand = project?.brandProfile ?? await this.prisma.brandProfile.findFirst({ where: { isDefault: true, archived: false } });

    const assets: Partial<Record<AssetType, string>> = {};
    for (const asset of project?.assets ?? []) {
      assets[asset.type as AssetType] = asset.path;
    }

    const root = process.cwd();
    const demoRoot = path.join(root, "assets", "demo", "e2e");
    const aiBackground = path.join(
      root,
      "storage",
      "ai-video",
      "cmua1uv470000twq0zvlropgk",
      "cmua1uvta0004twq06sj5dthj.mp4"
    );
    const motion = typeof body.motion === "string" ? body.motion : "cinematic";

    const outputPath = await renderHybridMobilePreview(
      {
        projectId: project?.id ?? "hybrid-mobile-preview",
        template: "fullpos-premium-vertical",
        format: "9:16",
        fps: 30,
        durationSeconds: 5,
        brand: {
          name: project?.productName ?? brand?.name ?? "Video Studio",
          headline: project?.headline ?? "Tu video profesional",
          subheadline: project?.subheadline ?? "Contenido claro para tu marca.",
          offer: project?.offer ?? brand?.defaultOffer ?? "",
          price: project?.price ?? brand?.defaultPriceText ?? "",
          website: project?.website ?? brand?.website ?? ""
        },
        brandProfile: brand ? brandProfileForPayload(brand) : undefined,
        assets: {
          logo: assets.logo ?? path.join(demoRoot, "logo.png"),
          billing: assets.billing ?? path.join(demoRoot, "billing.png"),
          products: assets.products ?? path.join(demoRoot, "products.png"),
          reports: assets.reports ?? path.join(demoRoot, "reports.png"),
          mobile: assets.mobile ?? path.join(demoRoot, "mobile.png")
        },
        audio: { voiceoverEnabled: false, musicEnabled: false },
        scenes: {
          mobile: { scale: 1.02, y: 0, fit: "cover" },
          billing: { scale: 1.16, y: -14, fit: "cover" },
          products: { scale: 1.16, y: -14, fit: "cover" },
          reports: { scale: 1.14, y: -12, fit: "cover" },
          devices: { scale: 1.08, y: -10, fit: "cover" }
        },
        visual: {
          style: project?.visualStyle ?? "technology-cinematic",
          motion,
          aiSceneMode: "hybrid",
          aiMotionIntensity: motion as "elegant" | "cinematic" | "dynamic",
          aiBackgroundVideoPath: aiBackground
        }
      },
      { renderId, outputRoot: rendersRoot }
    );
    return { id: renderId, outputPath, streamUrl: `/renders/hybrid-preview/${renderId}/stream` };
  }

  async renderQuickTutorialPreview(body: Record<string, unknown>) {
    const payload = await this.previewPayload(body, "QUICK_TUTORIAL");
    const outputPath = await renderQuickTutorialPreview(payload, {
      renderId: "quick-tutorial-preview",
      outputRoot: rendersRoot
    });
    return { id: "quick-tutorial-preview", outputPath, streamUrl: "/renders/preview/quick-tutorial-preview/stream" };
  }

  async renderCourseScenePreview(body: Record<string, unknown>) {
    const payload = await this.previewPayload(body, "COURSE");
    const outputPath = await renderProfessionalCoursePreview(payload, {
      renderId: "professional-course-scene-preview",
      outputRoot: rendersRoot
    });
    return { id: "professional-course-scene-preview", outputPath, streamUrl: "/renders/preview/professional-course-scene-preview/stream" };
  }

  private async previewPayload(body: Record<string, unknown>, videoType: "QUICK_TUTORIAL" | "COURSE"): Promise<RenderPayload> {
    const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const project = projectId ? await this.prisma.project.findUnique({ where: { id: projectId }, include: { assets: true, scenes: { orderBy: { order: "asc" } }, brandProfile: true } }) : null;
    const brand = project?.brandProfile ?? await this.prisma.brandProfile.findFirst({ where: { isDefault: true, archived: false } });
    const assets: Partial<Record<AssetType, string>> = {};
    for (const asset of project?.assets ?? []) {
      assets[asset.type as AssetType] = asset.path;
    }
    const root = process.cwd();
    const demoRoot = path.join(root, "assets", "demo", "e2e");
    const scenesList = (project?.scenes ?? []).map((scene) => ({
      id: scene.id,
      projectId: scene.projectId,
      type: scene.type as RenderPayload["scenesList"] extends Array<infer T> ? T extends { type: infer U } ? U : never : never,
      order: scene.order,
      chapter: scene.chapter ?? undefined,
      title: scene.title,
      duration: scene.duration,
      narrationScript: scene.narrationScript ?? undefined,
      assetRefs: scene.assetRefs ? safeJsonArray(scene.assetRefs) : undefined,
      transition: scene.transition ?? undefined,
      animation: scene.animation ? safeJsonObject(scene.animation) : undefined
    })) as RenderPayload["scenesList"];
    return {
      projectId: project?.id ?? `${videoType.toLowerCase()}-preview`,
      videoType,
      template: videoType === "COURSE" ? "professional-course" : "quick-tutorial",
      format: videoType === "COURSE" ? "16:9" : "9:16",
      fps: 30,
      durationSeconds: videoType === "COURSE" ? 18 : 20,
      subtitleMode: "AUTO_FROM_NARRATION",
      narrationStyle: videoType === "COURSE" ? "TRAINING" : "QUICK_TUTORIAL",
      brand: {
        name: project?.productName ?? brand?.name ?? "Video Studio",
        headline: project?.headline ?? "Aprende paso a paso",
        subheadline: project?.subheadline ?? "Curso y tutoriales profesionales.",
        offer: project?.offer ?? brand?.defaultOffer ?? "Aprende paso a paso",
        price: project?.price ?? brand?.defaultPriceText ?? "",
        website: project?.website ?? brand?.website ?? ""
      },
      brandProfile: brand ? brandProfileForPayload(brand) : undefined,
      assets: {
        logo: assets.logo ?? path.join(demoRoot, "logo.png"),
        billing: assets.billing ?? path.join(demoRoot, "billing.png"),
        products: assets.products ?? path.join(demoRoot, "products.png"),
        reports: assets.reports ?? path.join(demoRoot, "reports.png"),
        mobile: assets.mobile ?? path.join(root, "storage", "uploads", "cmu958qw90001tw8c8pke17ns", "mobile-70b9b81e-7fe9-4098-9cda-eff209ede5de.jpg")
      },
      scenesList,
      audio: { voiceoverEnabled: false, musicEnabled: false },
      visual: { style: "clean-corporate", motion: "cinematic" }
    };
  }

  async run(jobId: string) {
    const job = await this.prisma.renderJob.findUnique({
      where: { id: jobId },
      include: {
        project: {
          include: { assets: true, scenes: { orderBy: { order: "asc" } }, brandProfile: true }
        }
      }
    });
    if (!job) throw new NotFoundException("Render job not found.");

    await this.prisma.renderJob.update({
      where: { id: jobId },
      data: { status: "RENDERING", progress: 1, startedAt: new Date() }
    });

    const assets: Partial<Record<AssetType, string>> = {};
    for (const asset of job.project.assets) {
      assets[asset.type as AssetType] = asset.path;
    }

    const preparedAudio = await this.audio.prepare({
      jobId,
      projectId: job.projectId,
      voiceoverEnabled: job.project.voiceoverEnabled,
      voiceoverScript: job.project.voiceoverScript,
      voiceProfile: job.project.voiceProfile,
      voiceId: job.project.voiceId,
      voiceReferencePath: job.project.voiceReferencePath,
      voiceName: job.project.voiceName,
      voiceSpeed: job.project.voiceSpeed,
      voiceVolume: job.project.voiceVolume,
      musicEnabled: job.project.musicEnabled,
      musicTrackId: job.project.musicTrackId,
      musicPath: job.project.musicPath,
      customMusicPath: job.project.customMusicPath,
      musicVolume: job.project.musicVolume,
      durationSeconds: 30,
      pronunciationDictionary: job.project.brandProfile?.pronunciationDictionary ? safePronunciations(job.project.brandProfile.pronunciationDictionary) : undefined
    });

    await this.prisma.renderJob.update({
      where: { id: jobId },
      data: {
        voiceoverPath: preparedAudio.voiceoverPath,
        musicPath: preparedAudio.musicPath,
        audioNote: preparedAudio.note
      }
    });

    const payload: RenderPayload = {
      projectId: job.projectId,
      videoType: job.project.videoType as RenderPayload["videoType"],
      template: (job.project.template === "fullpos-premium-vertical" ? "saas-premium-ad" : job.project.template) as RenderPayload["template"],
      format: job.project.format as RenderPayload["format"],
      fps: 30,
      durationSeconds: job.project.durationSeconds ?? 30,
      subtitleMode: job.project.subtitleMode as RenderPayload["subtitleMode"],
      narrationStyle: job.project.narrationStyle as RenderPayload["narrationStyle"],
      brand: {
        name: job.project.productName,
        headline: job.project.headline,
        subheadline: job.project.subheadline ?? undefined,
        offer: job.project.offer,
        price: job.project.price,
        website: job.project.website
      },
      brandProfile: job.project.brandProfile ? brandProfileForPayload(job.project.brandProfile) : undefined,
      assets,
      scenesList: job.project.scenes.map((scene) => ({
        id: scene.id,
        projectId: scene.projectId,
        type: scene.type as NonNullable<RenderPayload["scenesList"]>[number]["type"],
        order: scene.order,
        chapter: scene.chapter ?? undefined,
        title: scene.title,
        duration: scene.duration,
        narrationScript: scene.narrationScript ?? undefined,
        assetRefs: scene.assetRefs ? safeJsonArray(scene.assetRefs) : undefined,
        transition: scene.transition ?? undefined,
        animation: scene.animation ? safeJsonObject(scene.animation) as NonNullable<NonNullable<RenderPayload["scenesList"]>[number]["animation"]> : undefined
      })),
      audio: {
        voiceoverEnabled: job.project.voiceoverEnabled,
        musicEnabled: job.project.musicEnabled,
        voiceoverScript: job.project.voiceoverScript ?? undefined,
        voiceName: job.project.voiceName,
        voiceProfile: job.project.voiceProfile,
        voiceId: job.project.voiceId ?? undefined,
        voiceReferencePath: job.project.voiceReferencePath ?? undefined,
        voiceSpeed: job.project.voiceSpeed,
        voiceOverPath: preparedAudio.voiceoverPath,
        musicPath: preparedAudio.musicPath,
        musicVolume: job.project.musicVolume,
        voiceVolume: job.project.voiceVolume,
        voiceStartSeconds: 0.4
      },
      scenes: {
        billing: { scale: 1.18, y: -18, fit: "cover" },
        products: { scale: 1.22, y: -12, fit: "cover" },
        reports: { scale: 1.2, y: -10, fit: "cover" },
        mobile: { scale: 1.08, y: -24, fit: "cover" },
        devices: { scale: 1.05, y: -16, fit: "cover" }
      },
      visual: {
        style: job.project.visualStyle,
        motion: job.project.motionIntensity
      }
    };

    const renderer = payload.template === "quick-tutorial"
      ? renderQuickTutorialPreview
      : payload.template === "professional-course"
        ? renderProfessionalCoursePreview
        : renderFullPosVideo;
    const outputPath = await renderer(payload, {
      renderId: jobId,
      outputRoot: rendersRoot,
      onProgress: async (progress: number) => {
        await this.prisma.renderJob.update({
          where: { id: jobId },
          data: { progress: Math.max(1, Math.min(99, progress)) }
        });
      }
    });
    const exportPath = path.join(path.dirname(outputPath), `${safeSlug(job.project.brandProfile?.slug ?? job.project.productName)}_${safeSlug(job.project.name)}_${timestampForFile(new Date())}.mp4`);
    await rename(outputPath, exportPath);

    return this.prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        outputPath: exportPath,
        completedAt: new Date()
      }
    });
  }
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : undefined;
  } catch {
    return undefined;
  }
}

function safeJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function brandProfileForPayload(brand: {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  website: string | null;
  whatsapp: string | null;
  email: string | null;
  defaultCTA: string | null;
  defaultOffer: string | null;
  defaultPriceText: string | null;
  defaultVoiceProfile: string | null;
  defaultNarrationStyle: string | null;
  defaultMusicTrackId: string | null;
  defaultMusicVolume: number;
  defaultIntroTemplate: string;
  defaultOutroTemplate: string;
  watermarkEnabled: boolean;
  watermarkPosition: string;
  watermarkOpacity: number;
  fontHeading: string;
  fontBody: string;
  musicPreferences: string | null;
  pronunciationDictionary: string | null;
}) {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    accentColor: brand.accentColor,
    backgroundColor: brand.backgroundColor,
    textColor: brand.textColor,
    website: brand.website ?? undefined,
    whatsapp: brand.whatsapp ?? undefined,
    email: brand.email ?? undefined,
    defaultCTA: brand.defaultCTA ?? undefined,
    defaultOffer: brand.defaultOffer ?? undefined,
    defaultPriceText: brand.defaultPriceText ?? undefined,
    defaultVoiceProfile: brand.defaultVoiceProfile ?? undefined,
    defaultNarrationStyle: brand.defaultNarrationStyle as "PROMOTIONAL" | "TRAINING" | "QUICK_TUTORIAL" | "CORPORATE" | "MOTIVATIONAL" | undefined,
    defaultMusicTrackId: brand.defaultMusicTrackId ?? undefined,
    defaultMusicVolume: brand.defaultMusicVolume,
    defaultIntroTemplate: brand.defaultIntroTemplate,
    defaultOutroTemplate: brand.defaultOutroTemplate,
    watermarkEnabled: brand.watermarkEnabled,
    watermarkPosition: brand.watermarkPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right",
    watermarkOpacity: brand.watermarkOpacity,
    fontHeading: brand.fontHeading,
    fontBody: brand.fontBody,
    musicPreferences: brand.musicPreferences ? safeJsonArray(brand.musicPreferences) : undefined,
    pronunciationDictionary: brand.pronunciationDictionary ? safePronunciations(brand.pronunciationDictionary) : undefined
  };
}

function safePronunciations(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is { writtenText: string; spokenText: string } => item && typeof item.writtenText === "string" && typeof item.spokenText === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function safeSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "video";
}

function timestampForFile(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}
