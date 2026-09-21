import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createR2Client, R2_SIGNED_URL_TTL_SECONDS } from "../ai-video/r2-signed-url-ai-asset-transport.js";
import { readR2Config } from "../ai-video/r2-env.js";

export type StoredObject = {
  objectKey: string;
  checksum: string;
  sizeBytes: number;
  signedUrl?: string;
};

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const videoTypes = new Set(["video/mp4", "video/webm"]);
const audioTypes = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"]);

@Injectable()
export class R2StorageService {
  isConfigured() {
    return Boolean(readR2Config());
  }

  async createUploadIntent(input: { scope: string; ownerId: string; type: string; filename: string; mimeType: string; sizeBytes: number }) {
    const config = this.requiredConfig();
    assertAllowedUpload(input.mimeType, input.sizeBytes);
    const extension = extensionFor(input.mimeType, input.filename);
    const objectKey = objectKeyFor(input.scope, input.ownerId, input.type, extension);
    const client = createR2Client(config);
    const signedUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
        ContentType: input.mimeType,
        ContentLength: input.sizeBytes
      }),
      { expiresIn: 10 * 60 }
    );
    return { objectKey, signedUrl, expiresInSeconds: 10 * 60 };
  }

  async verifyObject(objectKey: string, expected: { sizeBytes?: number; checksum?: string } = {}) {
    const config = this.requiredConfig();
    const head = await createR2Client(config).send(new HeadObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
    const sizeBytes = Number(head.ContentLength ?? 0);
    if (expected.sizeBytes !== undefined && sizeBytes !== expected.sizeBytes) {
      throw new BadRequestException("Uploaded object size does not match.");
    }
    if (expected.checksum) {
      const downloaded = await this.downloadToBuffer(objectKey);
      const checksum = sha256Buffer(downloaded);
      if (checksum !== expected.checksum) throw new BadRequestException("Uploaded object checksum does not match.");
    }
    return { sizeBytes, contentType: head.ContentType };
  }

  async uploadFile(objectKey: string, filePath: string, mimeType: string): Promise<StoredObject> {
    const config = this.requiredConfig();
    const info = await stat(filePath);
    const checksum = await sha256File(filePath);
    await createR2Client(config).send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: createReadStream(filePath),
      ContentType: mimeType,
      ContentLength: info.size
    }));
    await this.verifyObject(objectKey, { sizeBytes: info.size, checksum });
    return { objectKey, checksum, sizeBytes: info.size };
  }

  async signedGetUrl(objectKey: string) {
    const config = this.requiredConfig();
    return getSignedUrl(createR2Client(config), new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey }), { expiresIn: R2_SIGNED_URL_TTL_SECONDS });
  }

  async downloadToFile(objectKey: string, destination: string) {
    const config = this.requiredConfig();
    const result = await createR2Client(config).send(new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
    if (!result.Body) throw new BadRequestException("R2 object could not be downloaded.");
    await pipeline(result.Body as Readable, createWriteStream(destination));
  }

  async deleteObject(objectKey: string) {
    const config = this.requiredConfig();
    await createR2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
  }

  private async downloadToBuffer(objectKey: string) {
    const config = this.requiredConfig();
    const result = await createR2Client(config).send(new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
    if (!result.Body) throw new BadRequestException("R2 object could not be downloaded.");
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Buffer | Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  private requiredConfig() {
    const config = readR2Config();
    if (!config) throw new ServiceUnavailableException("R2 storage is not configured.");
    return config;
  }
}

export function assertAllowedUpload(mimeType: string, sizeBytes: number) {
  const maxImage = envMb("MAX_IMAGE_UPLOAD_MB", 20);
  const maxVideo = envMb("MAX_VIDEO_UPLOAD_MB", 250);
  const maxAudio = envMb("MAX_AUDIO_UPLOAD_MB", 50);
  if (imageTypes.has(mimeType) && sizeBytes <= maxImage * 1024 * 1024) return;
  if (videoTypes.has(mimeType) && sizeBytes <= maxVideo * 1024 * 1024) return;
  if (audioTypes.has(mimeType) && sizeBytes <= maxAudio * 1024 * 1024) return;
  throw new BadRequestException("Unsupported file type or size.");
}

export function objectKeyFor(scope: string, ownerId: string, type: string, extension: string) {
  const cleanOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, "");
  const id = randomUUID();
  if (scope === "brands") {
    const folder = type === "LOGO" ? "logos" : "assets";
    return `brands/${cleanOwner}/${folder}/${id}${extension}`;
  }
  if (type === "screen_recording") return `projects/${cleanOwner}/recordings/${id}${extension}`;
  if (type === "video") return `projects/${cleanOwner}/recordings/${id}${extension}`;
  if (type === "audio" || type === "music" || type === "voice_reference") return `projects/${cleanOwner}/audio/${id}${extension}`;
  if (type === "render") return `projects/${cleanOwner}/renders/${id}.mp4`;
  if (type === "ai") return `projects/${cleanOwner}/ai/${id}.mp4`;
  if (type === "screenshot") return `projects/${cleanOwner}/screenshots/${id}${extension}`;
  return `projects/${cleanOwner}/images/${id}${extension}`;
}

export function extensionFor(mimeType: string, filename = "") {
  const existing = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm", ".mp3", ".wav", ".m4a"].includes(existing)) return existing;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return ".m4a";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return ".wav";
  return ".jpg";
}

export function sha256File(file: string) {
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

function envMb(name: string, fallback: number) {
  const value = Number(process.env[name] ?? "");
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
