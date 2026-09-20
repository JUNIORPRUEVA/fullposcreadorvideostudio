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
      (assets as Record<string, string>)[asset.id] = asset.path;
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
      (assets as Record<string, string>)[asset.id] = asset.path;
    }
    const root = process.cwd();
    const demoRoot = path.join(root, "assets", "demo", "e2e");
    const sceneId = typeof body.sceneId === "string" ? body.sceneId : undefined;
    const chapter = typeof body.chapter === "string" ? body.chapter : undefined;
    const selectedScenes = (project?.scenes ?? []).filter((scene) => {
      if (sceneId) return scene.id === sceneId;
      if (chapter) return scene.chapter === chapter || scene.title === chapter;
      return true;
    });
    const scenesList = selectedScenes.map((scene) => sceneForPayload(scene)) as RenderPayload["scenesList"];
    const durationSeconds = Math.max(1, scenesList?.reduce((sum, scene) => sum + scene.duration, 0) ?? (videoType === "COURSE" ? 18 : 20));
    return {
      projectId: project?.id ?? `${videoType.toLowerCase()}-preview`,
      videoType,
      template: videoType === "COURSE" ? "professional-course" : "quick-tutorial",
      format: videoType === "COURSE" ? "16:9" : "9:16",
      fps: 30,
      durationSeconds,
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
      (assets as Record<string, string>)[asset.id] = asset.path;
    }

    const baseScenes = job.project.scenes.map((scene) => sceneForPayload(scene));
    const sceneNarration = await this.prepareSceneNarration(job, baseScenes);
    const scenesList = baseScenes.map((scene) => {
      const prepared = sceneNarration.get(scene.id);
      const narrationDuration = prepared?.durationSeconds ?? scene.narrationDurationSeconds;
      const duration = scene.durationMode === "AUTO" && narrationDuration ? Math.max(scene.duration, narrationDuration + 0.6) : scene.duration;
      return {
        ...scene,
        duration,
        narrationAudioPath: prepared?.path ?? scene.narrationAudioPath,
        narrationDurationSeconds: narrationDuration
      };
    });
    const timelineDuration = Math.max(1, scenesList.reduce((sum, scene) => sum + scene.duration, 0));

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
      durationSeconds: timelineDuration,
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
      durationSeconds: job.project.durationSeconds ?? timelineDuration,
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
      scenesList,
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

    const renderer = payload.template === "quick-tutorial" || payload.template === "visual-support" || payload.template === "customer-onboarding"
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

  private async prepareSceneNarration(job: {
    projectId: string;
    project: {
      scenes: Array<{ id: string; narrationScript: string | null; voiceProfile: string | null; narrationStyle: string | null; narrationHash: string | null; narrationAudioPath: string | null; duration: number; durationMode: string }>;
      brandProfile: { pronunciationDictionary: string | null } | null;
      voiceId: string | null;
      voiceName: string;
      voiceProfile: string;
      voiceReferencePath: string | null;
      voiceSpeed: number;
      narrationStyle: string;
    };
  }, scenes: NonNullable<RenderPayload["scenesList"]>) {
    const results = new Map<string, { path: string; durationSeconds?: number }>();
    const dictionary = job.project.brandProfile?.pronunciationDictionary ? safePronunciations(job.project.brandProfile.pronunciationDictionary) : undefined;
    for (const scene of job.project.scenes) {
      if (!scene.narrationScript?.trim()) continue;
      const prepared = await this.audio.createSceneNarration({
        projectId: job.projectId,
        sceneId: scene.id,
        script: scene.narrationScript,
        voice: job.project.voiceId ?? job.project.voiceName,
        voiceProfile: scene.voiceProfile ?? job.project.voiceProfile,
        narrationStyle: scene.narrationStyle ?? job.project.narrationStyle,
        voiceReferencePath: job.project.voiceReferencePath,
        speed: job.project.voiceSpeed,
        pronunciationDictionary: dictionary,
        existingHash: scene.narrationHash,
        existingPath: scene.narrationAudioPath
      });
      await this.prisma.videoScene.update({
        where: { id: scene.id },
        data: {
          narrationHash: prepared.hash,
          narrationAudioPath: prepared.path,
          narrationDurationSeconds: prepared.durationSeconds,
          narrationUpdatedAt: new Date(),
          duration: scene.durationMode === "AUTO" && prepared.durationSeconds ? Math.max(scene.duration, prepared.durationSeconds + 0.6) : undefined
        }
      });
      results.set(scene.id, { path: prepared.path, durationSeconds: prepared.durationSeconds });
    }
    return results;
  }
}

function sceneForPayload(scene: {
  id: string;
  projectId: string;
  type: string;
  order: number;
  chapter: string | null;
  chapterTitleEnabled: boolean;
  title: string;
  duration: number;
  durationMode: string;
  narrationScript: string | null;
  voiceProfile: string | null;
  narrationStyle: string | null;
  narrationAudioPath: string | null;
  narrationDurationSeconds: number | null;
  assetRefs: string | null;
  mediaAssetId: string | null;
  trimStartSeconds: number | null;
  trimEndSeconds: number | null;
  sourceAudioEnabled: boolean;
  scale: number;
  positionX: number;
  positionY: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
  customSubtitles: string | null;
  transition: string | null;
  animation: string | null;
}): NonNullable<RenderPayload["scenesList"]>[number] {
  return {
    id: scene.id,
    projectId: scene.projectId,
    type: scene.type as NonNullable<RenderPayload["scenesList"]>[number]["type"],
    order: scene.order,
    chapter: scene.chapter ?? undefined,
    chapterTitleEnabled: scene.chapterTitleEnabled,
    title: scene.title,
    duration: scene.duration,
    durationMode: scene.durationMode === "MANUAL" ? "MANUAL" : "AUTO",
    narrationScript: scene.narrationScript ?? undefined,
    voiceProfile: scene.voiceProfile ?? undefined,
    narrationStyle: scene.narrationStyle as NonNullable<RenderPayload["scenesList"]>[number]["narrationStyle"],
    narrationAudioPath: scene.narrationAudioPath ?? undefined,
    narrationDurationSeconds: scene.narrationDurationSeconds ?? undefined,
    assetRefs: scene.assetRefs ? safeJsonArray(scene.assetRefs) : undefined,
    mediaAssetId: scene.mediaAssetId ?? undefined,
    trimStartSeconds: scene.trimStartSeconds ?? undefined,
    trimEndSeconds: scene.trimEndSeconds ?? undefined,
    sourceAudioEnabled: scene.sourceAudioEnabled,
    scale: scene.scale,
    positionX: scene.positionX,
    positionY: scene.positionY,
    crop: { top: scene.cropTop, right: scene.cropRight, bottom: scene.cropBottom, left: scene.cropLeft },
    customSubtitles: scene.customSubtitles ? safeJsonObject(scene.customSubtitles) as NonNullable<RenderPayload["scenesList"]>[number]["customSubtitles"] : undefined,
    transition: scene.transition ?? undefined,
    animation: scene.animation ? safeJsonObject(scene.animation) as NonNullable<NonNullable<RenderPayload["scenesList"]>[number]["animation"]> : undefined
  };
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
