import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertInside, audioRoot, uploadsRoot } from "../lib/paths.js";
import { validateProjectInput, type ProjectInput } from "./validation.js";
import { defaultTemplateFor, policyForVideoType } from "../video-studio/video-studio.metadata.js";
import { R2StorageService, objectKeyFor, sha256File } from "../storage/r2-storage.service.js";

const execFileAsync = promisify(execFile);

const includeProject = {
  assets: true,
  renderJobs: {
    orderBy: { createdAt: "desc" as const },
    take: 5
  },
  aiVideoJobs: {
    orderBy: { createdAt: "desc" as const },
    take: 5
  },
  scenes: {
    orderBy: { order: "asc" as const }
  },
  brandProfile: true
};

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(R2StorageService) private readonly r2: R2StorageService
  ) {}

  async create(body: Record<string, unknown>) {
    const input = validateProjectInput(body) as ProjectInput;
    const policy = policyForVideoType(input.videoType);
    const template = input.template ? defaultTemplateFallback(input.template) : defaultTemplateFor(policy.id).id;
    const brand = input.brandProfileId
      ? await this.prisma.brandProfile.findUnique({ where: { id: input.brandProfileId } })
      : await this.prisma.brandProfile.findFirst({ where: { isDefault: true, archived: false } });
    return this.prisma.project.create({
      data: {
        name: input.name,
        videoType: input.videoType ?? policy.id,
        brandProfileId: brand?.id,
        productName: input.productName ?? brand?.name ?? "New Brand",
        headline: input.headline,
        subheadline: input.subheadline,
        offer: input.offer || brand?.defaultOffer || "",
        price: input.price || brand?.defaultPriceText || "",
        website: input.website || brand?.website || "",
        template,
        format: input.format ?? policy.defaultFormat,
        durationMode: input.durationMode ?? defaultTemplateFor(policy.id).defaultDurationMode,
        durationSeconds: input.durationSeconds,
        subtitleMode: input.subtitleMode ?? policy.subtitleMode,
        narrationStyle: input.narrationStyle ?? policy.narrationStyle,
        voiceoverEnabled: input.voiceoverEnabled ?? false,
        voiceoverScript: input.voiceoverScript,
        voiceProfile: input.voiceProfile ?? brand?.defaultVoiceProfile ?? "dominican-promotional",
        voiceName: input.voiceName ?? brand?.defaultVoiceProfile ?? "Neutral",
        voiceId: input.voiceId,
        voiceReferenceId: input.voiceReferenceId,
        voiceReferencePath: input.voiceReferencePath,
        voiceReferenceName: input.voiceReferenceName,
        voiceSpeed: input.voiceSpeed ?? 1,
        voiceVolume: input.voiceVolume ?? 1,
        musicEnabled: input.musicEnabled ?? policy.musicEnabled,
        musicTrackId: input.musicTrackId ?? brand?.defaultMusicTrackId,
        musicPath: input.musicPath,
        customMusicPath: input.customMusicPath,
        musicVolume: input.musicVolume ?? brand?.defaultMusicVolume ?? (policy.id === "COURSE" || policy.id === "SUPPORT" ? 0.05 : 0.15),
        visualStyle: input.visualStyle ?? "saas-premium",
        motionIntensity: input.motionIntensity ?? "cinematic",
        scenes: {
          create: defaultScenesFor(policy.id)
        }
      },
      include: includeProject
    });
  }

  findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: includeProject
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: includeProject });
    if (!project) throw new NotFoundException("Project not found.");
    return project;
  }

  async update(id: string, body: Record<string, unknown>) {
    await this.findOne(id);
    const input = validateProjectInput(body, true);
    return this.prisma.project.update({
      where: { id },
      data: input,
      include: includeProject
    });
  }

  async duplicate(id: string) {
    const project = await this.findOne(id);
    return this.prisma.project.create({
      data: {
        name: `${project.name} copia`,
        videoType: project.videoType,
        productName: project.productName,
        headline: project.headline,
        subheadline: project.subheadline,
        offer: project.offer,
        price: project.price,
        website: project.website,
        template: project.template,
        format: project.format,
        durationMode: project.durationMode,
        durationSeconds: project.durationSeconds,
        subtitleMode: project.subtitleMode,
        narrationStyle: project.narrationStyle,
        brandProfileId: project.brandProfileId,
        voiceoverEnabled: project.voiceoverEnabled,
        voiceoverScript: project.voiceoverScript,
        voiceProfile: project.voiceProfile,
        voiceName: project.voiceName,
        voiceId: project.voiceId,
        voiceReferenceId: project.voiceReferenceId,
        voiceReferencePath: project.voiceReferencePath,
        voiceReferenceName: project.voiceReferenceName,
        voiceSpeed: project.voiceSpeed,
        voiceVolume: project.voiceVolume,
        musicEnabled: project.musicEnabled,
        musicTrackId: project.musicTrackId,
        musicPath: project.musicPath,
        customMusicPath: project.customMusicPath,
        musicVolume: project.musicVolume,
        visualStyle: project.visualStyle,
        motionIntensity: project.motionIntensity,
        scenes: {
          create: project.scenes.map((scene) => ({
            type: scene.type,
            order: scene.order,
            chapter: scene.chapter,
            chapterTitleEnabled: scene.chapterTitleEnabled,
            title: scene.title,
            duration: scene.duration,
            durationMode: scene.durationMode,
            narrationScript: scene.narrationScript,
            voiceProfile: scene.voiceProfile,
            narrationStyle: scene.narrationStyle,
            assetRefs: scene.assetRefs,
            mediaAssetId: scene.mediaAssetId,
            trimStartSeconds: scene.trimStartSeconds,
            trimEndSeconds: scene.trimEndSeconds,
            sourceAudioEnabled: scene.sourceAudioEnabled,
            scale: scene.scale,
            positionX: scene.positionX,
            positionY: scene.positionY,
            cropTop: scene.cropTop,
            cropRight: scene.cropRight,
            cropBottom: scene.cropBottom,
            cropLeft: scene.cropLeft,
            customSubtitles: scene.customSubtitles,
            transition: scene.transition,
            animation: scene.animation
          }))
        },
        assets: {
          create: project.assets.map((asset) => ({
            type: asset.type,
            filename: asset.filename,
            path: asset.path,
            mimeType: asset.mimeType,
            durationSeconds: asset.durationSeconds,
            width: asset.width,
            height: asset.height,
            codec: asset.codec,
            trimStart: asset.trimStart,
            trimEnd: asset.trimEnd,
            storageProvider: asset.storageProvider,
            objectKey: asset.objectKey,
            originalFilename: asset.originalFilename,
            sizeBytes: asset.sizeBytes,
            checksum: asset.checksum,
            metadata: asset.metadata
          }))
        }
      },
      include: includeProject
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  async saveAsset(projectId: string, type: string, file: Express.Multer.File) {
    await this.findOne(projectId);
    const extension = extensionForMime(file.mimetype);
    const filename = `${type}-${randomUUID()}${extension}`;
    const objectKey = this.r2.isConfigured() ? objectKeyFor("projects", projectId, type, extension) : undefined;
    let storageProvider = "local";
    let checksum: string | undefined;
    let sizeBytes: number | undefined;
    let finalPath = "";

    if (objectKey) {
      const uploaded = await this.r2.uploadFile(objectKey, file.path, file.mimetype);
      storageProvider = "r2";
      checksum = uploaded.checksum;
      sizeBytes = uploaded.sizeBytes;
      await rm(file.path, { force: true });
    } else {
      const projectUploadDir = path.join(uploadsRoot, projectId);
      finalPath = path.join(projectUploadDir, filename);
      assertInside(uploadsRoot, finalPath);
      await mkdir(projectUploadDir, { recursive: true });
      await rename(file.path, finalPath);
      checksum = await sha256File(finalPath);
      sizeBytes = file.size;
    }

    const metadata = file.mimetype.startsWith("video/") && finalPath ? await probeVideo(finalPath) : {};
    return this.prisma.asset.create({
      data: {
        projectId,
        type,
        filename,
        path: finalPath,
        mimeType: file.mimetype,
        storageProvider,
        objectKey,
        originalFilename: file.originalname,
        sizeBytes,
        checksum,
        metadata: objectKey ? JSON.stringify({ objectKey, uploadedAt: new Date().toISOString(), sizeBytes, checksum }) : undefined,
        ...metadata
      }
    });
  }

  async createAssetUploadIntent(projectId: string, body: Record<string, unknown>) {
    await this.findOne(projectId);
    const type = str(body.type, "type", true);
    const filename = str(body.filename, "filename", true, 260);
    const mimeType = str(body.mimeType, "mimeType", true, 120);
    const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : 0;
    return this.r2.createUploadIntent({ scope: "projects", ownerId: projectId, type: type!, filename: filename!, mimeType: mimeType!, sizeBytes });
  }

  async completeAssetUpload(projectId: string, body: Record<string, unknown>) {
    await this.findOne(projectId);
    const type = str(body.type, "type", true)!;
    const filename = str(body.filename, "filename", true, 260)!;
    const mimeType = str(body.mimeType, "mimeType", true, 120)!;
    const objectKey = str(body.objectKey, "objectKey", true, 520)!;
    const checksum = str(body.checksum, "checksum", false, 128);
    const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : undefined;
    if (!objectKey.startsWith(`projects/${projectId}/`)) throw new BadRequestException("Uploaded object key is not valid for this project.");
    const verified = await this.r2.verifyObject(objectKey, { sizeBytes, checksum });
    return this.prisma.asset.create({
      data: {
        projectId,
        type,
        filename: filename || path.basename(objectKey),
        path: "",
        mimeType,
        storageProvider: "r2",
        objectKey,
        originalFilename: filename,
        sizeBytes: sizeBytes ?? verified.sizeBytes,
        checksum,
        metadata: JSON.stringify({ objectKey, uploadedAt: new Date().toISOString(), sizeBytes: sizeBytes ?? verified.sizeBytes, checksum })
      }
    });
  }

  async findAsset(projectId: string, assetId: string) {
    return this.prisma.asset.findFirst({ where: { id: assetId, projectId } });
  }

  async signedAssetUrl(asset: { storageProvider?: string | null; objectKey?: string | null } | null) {
    if (!asset?.objectKey || asset.storageProvider !== "r2") return undefined;
    return this.r2.signedGetUrl(asset.objectKey);
  }

  createScene(projectId: string, body: Record<string, unknown>) {
    return this.upsertScene(projectId, body);
  }

  async updateScene(projectId: string, sceneId: string, body: Record<string, unknown>) {
    const project = await this.findOne(projectId);
    validateSceneTrim(project.assets, body);
    return this.prisma.videoScene.update({
      where: { id: sceneId },
      data: sceneData(body)
    });
  }

  async duplicateScene(projectId: string, sceneId: string) {
    await this.findOne(projectId);
    const scene = await this.prisma.videoScene.findUnique({ where: { id: sceneId } });
    if (!scene) throw new NotFoundException("Scene not found.");
    return this.prisma.videoScene.create({
      data: {
        projectId,
        type: scene.type,
        order: scene.order + 1,
        chapter: scene.chapter,
        chapterTitleEnabled: scene.chapterTitleEnabled,
        title: `${scene.title} copia`,
        duration: scene.duration,
        durationMode: scene.durationMode,
        narrationScript: scene.narrationScript,
        voiceProfile: scene.voiceProfile,
        narrationStyle: scene.narrationStyle,
        assetRefs: scene.assetRefs,
        mediaAssetId: scene.mediaAssetId,
        trimStartSeconds: scene.trimStartSeconds,
        trimEndSeconds: scene.trimEndSeconds,
        sourceAudioEnabled: scene.sourceAudioEnabled,
        scale: scene.scale,
        positionX: scene.positionX,
        positionY: scene.positionY,
        cropTop: scene.cropTop,
        cropRight: scene.cropRight,
        cropBottom: scene.cropBottom,
        cropLeft: scene.cropLeft,
        customSubtitles: scene.customSubtitles,
        transition: scene.transition,
        animation: scene.animation
      }
    });
  }

  async removeScene(projectId: string, sceneId: string) {
    await this.findOne(projectId);
    await this.prisma.videoScene.delete({ where: { id: sceneId } });
    return { ok: true };
  }

  async reorderScenes(projectId: string, body: Record<string, unknown>) {
    await this.findOne(projectId);
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
    await Promise.all(ids.map((id, index) => this.prisma.videoScene.update({ where: { id }, data: { order: index + 1 } })));
    return this.findOne(projectId);
  }

  private async upsertScene(projectId: string, body: Record<string, unknown>) {
    const project = await this.findOne(projectId);
    validateSceneTrim(project.assets, body);
    return this.prisma.videoScene.create({
      data: {
        projectId,
        ...sceneData(body)
      }
    });
  }

  async saveMusic(projectId: string, file?: Express.Multer.File) {
    await this.findOne(projectId);
    if (!file) throw new NotFoundException("Music file not found.");
    if (!["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"].includes(file.mimetype)) {
      throw new NotFoundException("Unsupported music file. Use MP3, WAV or M4A.");
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new NotFoundException("Music file is too large. Maximum size is 25MB.");
    }
    const extension = extensionForAudioMime(file.mimetype);
    const filename = `music-${randomUUID()}${extension}`;
    const projectMusicDir = path.join(audioRoot, "music", projectId, "uploads");
    const finalPath = path.join(projectMusicDir, filename);
    assertInside(path.join(audioRoot, "music"), finalPath);
    await mkdir(projectMusicDir, { recursive: true });
    await rename(file.path, finalPath);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { musicPath: finalPath, customMusicPath: finalPath, musicTrackId: null, musicEnabled: true },
      include: includeProject
    });
  }

  async saveVoiceReference(projectId: string, file?: Express.Multer.File) {
    await this.findOne(projectId);
    if (!file) throw new NotFoundException("Voice reference file not found.");
    if (!["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"].includes(file.mimetype)) {
      throw new NotFoundException("Unsupported voice reference. Use MP3, WAV or M4A.");
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new NotFoundException("Voice reference is too large. Maximum size is 20MB.");
    }
    const extension = extensionForAudioMime(file.mimetype);
    const referenceId = randomUUID();
    const filename = `voice-reference-${referenceId}${extension}`;
    const referenceDir = path.join(audioRoot, "voice-references", projectId);
    const finalPath = path.join(referenceDir, filename);
    assertInside(path.join(audioRoot, "voice-references"), finalPath);
    await mkdir(referenceDir, { recursive: true });
    await rename(file.path, finalPath);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        voiceReferenceId: referenceId,
        voiceReferencePath: finalPath,
        voiceReferenceName: file.originalname,
        voiceProfile: "dominican-promotional",
        voiceName: "Dominicana promocional"
      },
      include: includeProject
    });
  }
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  return ".jpg";
}

function str(value: unknown, field: string, required: boolean, max = 240) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new BadRequestException(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new BadRequestException(`${field} must be a string.`);
  const clean = value.trim();
  if (!clean && required) throw new BadRequestException(`${field} is required.`);
  if (clean.length > max) throw new BadRequestException(`${field} is too long.`);
  return clean;
}

function defaultTemplateFallback(template: string) {
  return template === "fullpos-premium-vertical" ? "saas-premium-ad" : template;
}

function defaultScenesFor(videoType: string) {
  if (videoType === "COURSE") {
    return [
      { type: "BRAND_INTRO", order: 1, chapter: "Introducción", title: "Intro", duration: 4, narrationScript: "Bienvenido al curso." },
      { type: "CHAPTER", order: 2, chapter: "Facturación", title: "Abrir facturación", duration: 6, narrationScript: "Vamos a abrir el módulo de facturación." },
      { type: "SCREENSHOT", order: 3, chapter: "Facturación", title: "Buscar producto", duration: 7, narrationScript: "Busca el producto que deseas vender." },
      { type: "CALLOUT", order: 4, chapter: "Facturación", title: "Agregar producto", duration: 7, narrationScript: "Pulsa agregar para incluirlo en el ticket." },
      { type: "SCREENSHOT", order: 5, chapter: "Cliente", title: "Seleccionar cliente", duration: 6, narrationScript: "Selecciona el cliente correspondiente." },
      { type: "CALLOUT", order: 6, chapter: "Cobro", title: "Cobrar", duration: 7, narrationScript: "Revisa el total y pulsa cobrar." },
      { type: "SUMMARY", order: 7, chapter: "Resumen", title: "Confirmación", duration: 5, narrationScript: "La venta queda registrada correctamente." },
      { type: "BRAND_OUTRO", order: 8, chapter: "Resumen", title: "Resumen", duration: 4, narrationScript: "Continúa practicando con tu equipo." }
    ];
  }
  if (videoType === "QUICK_TUTORIAL" || videoType === "SUPPORT") {
    return [
      { type: "TITLE", order: 1, title: "Cómo registrar una venta", duration: 2, narrationScript: "Aprende a registrar una venta rápidamente." },
      { type: "SCREENSHOT", order: 2, title: "Buscar producto", duration: 6, narrationScript: "Busca el producto en facturación." },
      { type: "CALLOUT", order: 3, title: "Agregar y cobrar", duration: 7, narrationScript: "Agrega el producto y pulsa cobrar." },
      { type: "SUMMARY", order: 4, title: "Resultado", duration: 4, narrationScript: "Listo, la venta fue creada." }
    ];
  }
  return [
    { type: "BRAND_INTRO", order: 1, title: "Intro", duration: 3, narrationScript: "Presenta tu marca." },
    { type: "DEVICE_SHOWCASE", order: 2, title: "Producto", duration: 8, narrationScript: "Muestra el producto principal." },
    { type: "CTA", order: 3, title: "CTA", duration: 4, narrationScript: "Invita a tomar acción." }
  ];
}

function sceneData(body: Record<string, unknown>) {
  const animation = typeof body.animation === "object" && body.animation ? normalizeSceneJson(body.animation) : typeof body.animation === "string" ? body.animation : undefined;
  const customSubtitles = Array.isArray(body.customSubtitles) ? normalizeSceneJson(body.customSubtitles) : typeof body.customSubtitles === "string" ? body.customSubtitles : undefined;
  return {
    type: typeof body.type === "string" ? body.type : "SCREENSHOT",
    order: typeof body.order === "number" ? body.order : 1,
    chapter: typeof body.chapter === "string" ? body.chapter : undefined,
    chapterTitleEnabled: typeof body.chapterTitleEnabled === "boolean" ? body.chapterTitleEnabled : undefined,
    title: typeof body.title === "string" ? body.title : "Nueva escena",
    duration: typeof body.duration === "number" ? body.duration : 5,
    durationMode: body.durationMode === "MANUAL" ? "MANUAL" : typeof body.durationMode === "string" ? "AUTO" : undefined,
    narrationScript: typeof body.narrationScript === "string" ? body.narrationScript : undefined,
    voiceProfile: typeof body.voiceProfile === "string" ? body.voiceProfile : undefined,
    narrationStyle: typeof body.narrationStyle === "string" ? body.narrationStyle : undefined,
    assetRefs: Array.isArray(body.assetRefs) ? JSON.stringify(body.assetRefs) : typeof body.assetRefs === "string" ? body.assetRefs : undefined,
    mediaAssetId: typeof body.mediaAssetId === "string" ? body.mediaAssetId : undefined,
    trimStartSeconds: typeof body.trimStartSeconds === "number" ? body.trimStartSeconds : undefined,
    trimEndSeconds: typeof body.trimEndSeconds === "number" ? body.trimEndSeconds : undefined,
    sourceAudioEnabled: typeof body.sourceAudioEnabled === "boolean" ? body.sourceAudioEnabled : undefined,
    scale: typeof body.scale === "number" ? body.scale : undefined,
    positionX: typeof body.positionX === "number" ? body.positionX : undefined,
    positionY: typeof body.positionY === "number" ? body.positionY : undefined,
    cropTop: typeof body.cropTop === "number" ? body.cropTop : undefined,
    cropRight: typeof body.cropRight === "number" ? body.cropRight : undefined,
    cropBottom: typeof body.cropBottom === "number" ? body.cropBottom : undefined,
    cropLeft: typeof body.cropLeft === "number" ? body.cropLeft : undefined,
    customSubtitles,
    transition: typeof body.transition === "string" ? body.transition : "smooth",
    animation
  };
}

function normalizeSceneJson(value: unknown) {
  return JSON.stringify(value);
}

function validateSceneTrim(assets: Array<{ id: string; type: string; durationSeconds: number | null }>, body: Record<string, unknown>) {
  const start = typeof body.trimStartSeconds === "number" ? body.trimStartSeconds : undefined;
  const end = typeof body.trimEndSeconds === "number" ? body.trimEndSeconds : undefined;
  if (start === undefined && end === undefined) return;
  const mediaAssetId = typeof body.mediaAssetId === "string" ? body.mediaAssetId : undefined;
  const asset = mediaAssetId ? assets.find((item) => item.id === mediaAssetId || item.type === mediaAssetId) : assets.find((item) => item.type === "screen_recording" || item.type === "video");
  const duration = asset?.durationSeconds ?? undefined;
  if (start !== undefined && start < 0) throw new Error("trimStartSeconds must be greater than or equal to 0.");
  if (end !== undefined && start !== undefined && end <= start) throw new Error("trimEndSeconds must be greater than trimStartSeconds.");
  if (duration !== undefined && end !== undefined && end > duration) throw new Error("trimEndSeconds exceeds source duration.");
}

async function probeVideo(filePath: string) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,duration",
      "-of",
      "json",
      filePath
    ], { timeout: 30_000 });
    const stream = JSON.parse(stdout).streams?.[0] ?? {};
    return {
      codec: typeof stream.codec_name === "string" ? stream.codec_name : undefined,
      width: typeof stream.width === "number" ? stream.width : undefined,
      height: typeof stream.height === "number" ? stream.height : undefined,
      durationSeconds: Number.isFinite(Number(stream.duration)) ? Number(stream.duration) : undefined,
      trimStart: 0,
      trimEnd: Number.isFinite(Number(stream.duration)) ? Number(stream.duration) : undefined
    };
  } catch {
    return {};
  }
}

function extensionForAudioMime(mimeType: string) {
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return ".m4a";
  return ".wav";
}
