import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertInside, uploadsRoot } from "../lib/paths.js";
import { createR2Client, R2_SIGNED_URL_TTL_SECONDS } from "../ai-video/r2-signed-url-ai-asset-transport.js";
import { readR2Config } from "../ai-video/r2-env.js";
import { safeBrandExport, slugify } from "./brand-utils.js";
import { R2StorageService, objectKeyFor, sha256File } from "../storage/r2-storage.service.js";

const includeBrand = { assets: true, projects: { select: { id: true, name: true, videoType: true } } };
const brandAssetTypes = new Set(["LOGO", "LOGO_LIGHT", "LOGO_DARK", "WATERMARK", "INTRO_VIDEO", "OUTRO_VIDEO", "BACKGROUND_IMAGE", "BACKGROUND_VIDEO", "MUSIC", "VOICE_REFERENCE", "PRODUCT_IMAGE", "DEVICE_SCREENSHOT", "OTHER"]);

type BrandInput = {
  name?: string;
  slug?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  website?: string;
  whatsapp?: string;
  email?: string;
  defaultCTA?: string;
  defaultOffer?: string;
  defaultPriceText?: string;
  defaultVoiceProfile?: string;
  defaultNarrationStyle?: string;
  defaultMusicTrackId?: string;
  defaultMusicVolume?: number;
  defaultIntroTemplate?: string;
  defaultOutroTemplate?: string;
  watermarkPosition?: string;
  watermarkOpacity?: number;
  watermarkEnabled?: boolean;
  archived?: boolean;
  isDefault?: boolean;
  fontHeading?: string;
  fontBody?: string;
  musicPreferences?: string;
  pronunciationDictionary?: string;
};

@Injectable()
export class BrandsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(R2StorageService) private readonly r2: R2StorageService
  ) {}

  findAll(includeArchived = false) {
    return this.prisma.brandProfile.findMany({
      where: includeArchived ? undefined : { archived: false },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: includeBrand
    });
  }

  async findOne(id: string) {
    const brand = await this.prisma.brandProfile.findUnique({ where: { id }, include: includeBrand });
    if (!brand) throw new NotFoundException("Brand not found.");
    return brand;
  }

  async defaultBrand() {
    const brand = await this.prisma.brandProfile.findFirst({ where: { isDefault: true, archived: false }, include: includeBrand });
    if (brand) return brand;
    return this.prisma.brandProfile.findFirst({ where: { archived: false }, include: includeBrand });
  }

  async create(body: Record<string, unknown>) {
    const data = brandInput(body);
    if (!data.name) throw new BadRequestException("name is required.");
    const slug = await this.uniqueSlug(data.slug ?? data.name);
    const existingDefault = await this.prisma.brandProfile.findFirst({ where: { isDefault: true } });
    return this.prisma.brandProfile.create({
      data: { ...data, name: data.name, slug, isDefault: Boolean(data.isDefault) || !existingDefault },
      include: includeBrand
    });
  }

  async update(id: string, body: Record<string, unknown>) {
    await this.findOne(id);
    const data = brandInput(body, true);
    return this.prisma.brandProfile.update({ where: { id }, data, include: includeBrand });
  }

  async duplicate(id: string) {
    const brand = await this.findOne(id);
    const slug = await this.uniqueSlug(`${brand.slug}-copy`);
    return this.prisma.brandProfile.create({
      data: {
        name: `${brand.name} copia`,
        slug,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        accentColor: brand.accentColor,
        backgroundColor: brand.backgroundColor,
        textColor: brand.textColor,
        website: brand.website,
        whatsapp: brand.whatsapp,
        email: brand.email,
        defaultCTA: brand.defaultCTA,
        defaultOffer: brand.defaultOffer,
        defaultPriceText: brand.defaultPriceText,
        defaultVoiceProfile: brand.defaultVoiceProfile,
        defaultNarrationStyle: brand.defaultNarrationStyle,
        defaultMusicTrackId: brand.defaultMusicTrackId,
        defaultMusicVolume: brand.defaultMusicVolume,
        defaultIntroTemplate: brand.defaultIntroTemplate,
        defaultOutroTemplate: brand.defaultOutroTemplate,
        watermarkEnabled: brand.watermarkEnabled,
        watermarkPosition: brand.watermarkPosition,
        watermarkOpacity: brand.watermarkOpacity,
        fontHeading: brand.fontHeading,
        fontBody: brand.fontBody,
        musicPreferences: brand.musicPreferences,
        pronunciationDictionary: brand.pronunciationDictionary
      },
      include: includeBrand
    });
  }

  async archive(id: string) {
    const brand = await this.findOne(id);
    if (brand.isDefault) await this.ensureAnotherActiveBrand(id);
    return this.prisma.brandProfile.update({ where: { id }, data: { archived: true, isDefault: false }, include: includeBrand });
  }

  async restore(id: string) {
    await this.findOne(id);
    return this.prisma.brandProfile.update({ where: { id }, data: { archived: false }, include: includeBrand });
  }

  async remove(id: string) {
    const brand = await this.findOne(id);
    if (brand.isDefault) throw new BadRequestException("Default brand cannot be deleted before another default is selected.");
    if (brand.projects.length > 0) throw new BadRequestException(`Brand is used by ${brand.projects.length} projects. Archive it or reassign projects before deleting.`);
    await this.prisma.brandAsset.deleteMany({ where: { brandProfileId: id } });
    return this.prisma.brandProfile.delete({ where: { id }, include: includeBrand });
  }

  async reassignAndDelete(id: string, body: Record<string, unknown>) {
    const targetBrandId = str(body.targetBrandId, "targetBrandId", true);
    if (!targetBrandId || targetBrandId === id) throw new BadRequestException("A different target brand is required.");
    const source = await this.findOne(id);
    const target = await this.findOne(targetBrandId);
    if (source.isDefault) throw new BadRequestException("Default brand cannot be deleted before another default is selected.");
    if (target.archived) throw new BadRequestException("Target brand must be active.");
    await this.prisma.project.updateMany({ where: { brandProfileId: id }, data: { brandProfileId: targetBrandId } });
    await this.prisma.brandAsset.deleteMany({ where: { brandProfileId: id } });
    return this.prisma.brandProfile.delete({ where: { id }, include: includeBrand });
  }

  async setDefault(id: string) {
    await this.findOne(id);
    await this.prisma.brandProfile.updateMany({ data: { isDefault: false } });
    return this.prisma.brandProfile.update({ where: { id }, data: { isDefault: true, archived: false }, include: includeBrand });
  }

  async findAsset(brandId: string, assetId: string) {
    const asset = await this.prisma.brandAsset.findFirst({ where: { id: assetId, brandProfileId: brandId } });
    if (!asset) throw new NotFoundException("Brand asset not found.");
    return asset;
  }

  async saveAsset(brandId: string, type: string, file?: Express.Multer.File) {
    await this.findOne(brandId);
    if (!file) throw new BadRequestException("File is required.");
    if (!brandAssetTypes.has(type)) throw new BadRequestException("Unsupported brand asset type.");
    const imageTypes = ["LOGO", "LOGO_LIGHT", "LOGO_DARK", "WATERMARK", "BACKGROUND_IMAGE", "PRODUCT_IMAGE", "DEVICE_SCREENSHOT", "OTHER"];
    if (imageTypes.includes(type) && !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      throw new BadRequestException("Unsupported brand image file.");
    }
    if (file.size > 12 * 1024 * 1024) throw new BadRequestException("Brand asset file is too large.");
    if (!["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"].includes(file.mimetype)) {
      throw new BadRequestException("Unsupported brand asset file.");
    }
    const extension = extensionFor(file.mimetype);
    const filename = `${type.toLowerCase()}-${randomUUID()}${extension}`;
    const r2 = readR2Config();
    const objectKey = r2 ? objectKeyFor("brands", brandId, type, extension) : undefined;
    let finalPath = "";
    let checksum: string | undefined;
    if (r2 && objectKey) {
      const uploaded = await this.r2.uploadFile(objectKey, file.path, file.mimetype);
      checksum = uploaded.checksum;
      await rm(file.path, { force: true });
    } else {
      const brandDir = path.join(uploadsRoot, "brands", brandId);
      finalPath = path.join(brandDir, filename);
      assertInside(uploadsRoot, finalPath);
      await mkdir(brandDir, { recursive: true });
      await rename(file.path, finalPath);
      checksum = await sha256File(finalPath);
    }
    const asset = await this.prisma.brandAsset.create({
      data: {
        brandProfileId: brandId,
        type,
        filename,
        path: finalPath,
        mimeType: file.mimetype,
        storageProvider: r2 && objectKey ? "r2" : "local",
        objectKey,
        metadata: objectKey ? JSON.stringify({ objectKey, uploadedAt: new Date().toISOString(), size: file.size, checksum }) : undefined
      }
    });
    const update = assetFieldUpdate(type, asset.id);
    if (Object.keys(update).length) await this.prisma.brandProfile.update({ where: { id: brandId }, data: update });
    return asset;
  }

  async createAssetUploadIntent(brandId: string, body: Record<string, unknown>) {
    await this.findOne(brandId);
    const type = str(body.type, "type", true)!;
    const filename = str(body.filename, "filename", true, 260)!;
    const mimeType = str(body.mimeType, "mimeType", true, 120)!;
    const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : 0;
    if (!brandAssetTypes.has(type)) throw new BadRequestException("Unsupported brand asset type.");
    return this.r2.createUploadIntent({ scope: "brands", ownerId: brandId, type, filename, mimeType, sizeBytes });
  }

  async completeAssetUpload(brandId: string, body: Record<string, unknown>) {
    await this.findOne(brandId);
    const type = str(body.type, "type", true)!;
    const filename = str(body.filename, "filename", true, 260)!;
    const mimeType = str(body.mimeType, "mimeType", true, 120)!;
    const objectKey = str(body.objectKey, "objectKey", true, 520)!;
    const checksum = str(body.checksum, "checksum", false, 128);
    const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : undefined;
    if (!brandAssetTypes.has(type)) throw new BadRequestException("Unsupported brand asset type.");
    if (!objectKey.startsWith(`brands/${brandId}/`)) throw new BadRequestException("Uploaded object key is not valid for this brand.");
    const verified = await this.r2.verifyObject(objectKey, { sizeBytes, checksum });
    const asset = await this.prisma.brandAsset.create({
      data: {
        brandProfileId: brandId,
        type,
        filename,
        path: "",
        mimeType,
        storageProvider: "r2",
        objectKey,
        metadata: JSON.stringify({ objectKey, uploadedAt: new Date().toISOString(), size: sizeBytes ?? verified.sizeBytes, checksum })
      }
    });
    const update = assetFieldUpdate(type, asset.id);
    if (Object.keys(update).length) await this.prisma.brandProfile.update({ where: { id: brandId }, data: update });
    return asset;
  }

  async signedAssetUrl(asset: { objectKey: string | null; storageProvider?: string | null }) {
    if (asset.storageProvider !== "r2" || !asset.objectKey) return undefined;
    const config = readR2Config();
    if (!config) return undefined;
    return getSignedUrl(
      createR2Client(config),
      new GetObjectCommand({ Bucket: config.bucketName, Key: asset.objectKey }),
      { expiresIn: R2_SIGNED_URL_TTL_SECONDS }
    );
  }

  async exportBrand(id: string) {
    const brand = await this.findOne(id);
    return safeBrandExport(brand);
  }

  async importBrand(body: Record<string, unknown>) {
    const source = typeof body.brand === "object" && body.brand ? body.brand as Record<string, unknown> : body;
    return this.create({ ...source, name: `${typeof source.name === "string" ? source.name : "Imported Brand"} import` });
  }

  private async uniqueSlug(value: string) {
    const base = slugify(value);
    let slug = base;
    let count = 2;
    while (await this.prisma.brandProfile.findUnique({ where: { slug } })) {
      slug = `${base}-${count}`;
      count += 1;
    }
    return slug;
  }

  private async ensureAnotherActiveBrand(id: string) {
    const count = await this.prisma.brandProfile.count({ where: { archived: false, id: { not: id } } });
    if (count === 0) throw new BadRequestException("At least one active brand is required.");
  }
}

function brandInput(body: Record<string, unknown>, partial = false): BrandInput {
  const name = str(body.name, "name", !partial);
  const input: BrandInput = {};
  if (name) input.name = name;
  const fields = ["slug", "primaryColor", "secondaryColor", "accentColor", "backgroundColor", "textColor", "website", "whatsapp", "email", "defaultCTA", "defaultOffer", "defaultPriceText", "defaultVoiceProfile", "defaultNarrationStyle", "defaultMusicTrackId", "defaultIntroTemplate", "defaultOutroTemplate", "watermarkPosition", "fontHeading", "fontBody"] as const;
  for (const field of fields) {
    const value = str(body[field], field, false, 520);
    if (value !== undefined) input[field] = field === "slug" ? slugify(value) : value;
  }
  if (typeof body.defaultMusicVolume === "number") input.defaultMusicVolume = Math.max(0, Math.min(1, body.defaultMusicVolume));
  if (typeof body.watermarkOpacity === "number") input.watermarkOpacity = Math.max(0, Math.min(1, body.watermarkOpacity));
  if (typeof body.watermarkEnabled === "boolean") input.watermarkEnabled = body.watermarkEnabled;
  if (typeof body.archived === "boolean") input.archived = body.archived;
  if (typeof body.isDefault === "boolean") input.isDefault = body.isDefault;
  if (Array.isArray(body.musicPreferences)) input.musicPreferences = JSON.stringify(body.musicPreferences.filter((item) => typeof item === "string"));
  if (Array.isArray(body.pronunciationDictionary)) input.pronunciationDictionary = JSON.stringify(body.pronunciationDictionary);
  return input;
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

function extensionFor(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return ".m4a";
  if (mimeType === "audio/wav") return ".wav";
  return ".jpg";
}

function assetFieldUpdate(type: string, id: string) {
  if (type === "LOGO") return { logoPrimaryAssetId: id };
  if (type === "LOGO_LIGHT") return { logoLightAssetId: id };
  if (type === "LOGO_DARK") return { logoDarkAssetId: id };
  if (type === "WATERMARK") return { watermarkAssetId: id };
  return {};
}
