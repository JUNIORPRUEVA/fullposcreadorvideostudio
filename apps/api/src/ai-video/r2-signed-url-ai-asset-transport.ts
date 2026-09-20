import { Injectable } from "@nestjs/common";
import type { Asset } from "@prisma/client";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { assertInside, uploadsRoot } from "../lib/paths.js";
import { aiSceneTemplates, type AiVideoSceneId } from "./ai-video.profiles.js";
import type { AiAssetTransport, PreparedAiImage } from "./ai-asset-transport.js";
import { readR2Config, type R2Config } from "./r2-env.js";

export const R2_SIGNED_URL_TTL_SECONDS = 10 * 60;
const MAX_R2_INPUT_BYTES = 12 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface R2UploadResult {
  objectKey: string;
  signedUrl: string;
  expiresAt: string;
  localSha256: string;
  downloadedSha256?: string;
  contentType?: string;
  contentLength?: number;
}

@Injectable()
export class R2SignedUrlAiAssetTransport implements AiAssetTransport {
  private readonly configReader = readR2Config;

  isConfigured() {
    return Boolean(this.configReader());
  }

  async prepareImage(projectId: string, scene: AiVideoSceneId, assets: Asset[]): Promise<PreparedAiImage> {
    const config = this.configReader();
    if (!config) {
      return { ok: false, reason: "R2 no configurado." };
    }
    const template = aiSceneTemplates[scene];
    const asset = assets.find((item) => item.type === template.assetType);
    if (!asset) {
      return { ok: false, reason: `Falta la imagen requerida para ${template.label}.` };
    }

    const uploaded = await this.uploadAndSign(projectId, asset, config, true);
    return {
      ok: true,
      imageUrl: uploaded.signedUrl,
      localPath: asset.path,
      expiresAt: uploaded.expiresAt,
      objectKey: uploaded.objectKey,
      localSha256: uploaded.localSha256,
      downloadedSha256: uploaded.downloadedSha256,
      contentType: uploaded.contentType,
      contentLength: uploaded.contentLength
    };
  }

  async uploadAndSign(projectId: string, asset: Pick<Asset, "path" | "mimeType">, config = this.requiredConfig(), verifyDownload = false): Promise<R2UploadResult> {
    const info = validateR2Asset(asset.path, asset.mimeType);
    const objectKey = `ai-inputs/${projectId}/${randomUUID()}${info.extension}`;
    const client = createR2Client(config);
    const localSha256 = await sha256File(asset.path);
    await client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: createReadStream(asset.path),
      ContentType: asset.mimeType,
      ContentLength: info.size
    }));

    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey }),
      { expiresIn: R2_SIGNED_URL_TTL_SECONDS }
    );
    const expiresAt = new Date(Date.now() + R2_SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    if (!verifyDownload) {
      return { objectKey, signedUrl, expiresAt, localSha256 };
    }

    const downloaded = await downloadSignedUrlForQa(signedUrl);
    return {
      objectKey,
      signedUrl,
      expiresAt,
      localSha256,
      downloadedSha256: sha256Buffer(downloaded.buffer),
      contentType: downloaded.contentType,
      contentLength: downloaded.buffer.length
    };
  }

  async deleteObject(objectKey: string, config = this.requiredConfig()) {
    await createR2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
  }

  private requiredConfig() {
    const config = this.configReader();
    if (!config) throw new Error("R2 no configurado.");
    return config;
  }
}

export function createR2Client(config: R2Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

export function validateR2Asset(assetPath: string, mimeType: string) {
  assertInside(uploadsRoot, assetPath);
  if (!allowedMimeTypes.has(mimeType)) throw new Error("Unsupported R2 AI asset mime type.");
  const extension = path.extname(assetPath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new Error("Unsupported R2 AI asset extension.");
  if (!existsSync(assetPath)) throw new Error("R2 AI asset does not exist.");
  const stat = statSync(assetPath);
  if (!stat.isFile()) throw new Error("R2 AI asset must be a file.");
  if (stat.size <= 0 || stat.size > MAX_R2_INPUT_BYTES) throw new Error("R2 AI asset file size is not allowed.");
  return { extension, size: stat.size };
}

async function downloadSignedUrlForQa(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`R2 signed URL validation failed (${response.status}).`);
  const contentType = response.headers.get("content-type") ?? undefined;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length <= 0) throw new Error("R2 signed URL returned empty content.");
  return { buffer, contentType };
}

function sha256File(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
