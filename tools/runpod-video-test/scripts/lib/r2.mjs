/**
 * Transport for getting a local screenshot to RunPod.
 *
 * RunPod's image-to-video workers take `image` as a PUBLIC URL, so the lab
 * reuses the product's already-working mechanism: upload to the existing R2
 * bucket and hand RunPod a short-lived presigned GET URL
 * (`apps/api/src/ai-video/r2-signed-url-ai-asset-transport.ts`).
 *
 * The lab uses its own object-key prefix so it can never collide with, or
 * overwrite, product assets. Nothing here prints or persists a signed URL.
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createR2Client, loadR2Config, signedUrlTtlSeconds } from "./api-reuse.mjs";
import { log, maskUrl } from "./log.mjs";

export const LAB_KEY_PREFIX = "poc-runpod-video";

export async function r2Ready() {
  const config = await loadR2Config();
  return Boolean(config);
}

/**
 * Uploads one image and returns a presigned URL plus the object key needed for
 * cleanup. The signed URL is intentionally NOT returned in any log line.
 */
export async function uploadImageForRunpod({ localPath, mimeType, runId, label }) {
  const config = await loadR2Config();
  if (!config) {
    throw new Error("R2 is not configured, so no public image URL can be produced for RunPod.");
  }

  const size = statSync(localPath).size;
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const objectKey = `${LAB_KEY_PREFIX}/${runId}/${label}${extension}`;
  const client = await createR2Client(config);
  const ttl = await signedUrlTtlSeconds();

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: createReadStream(localPath),
      ContentType: mimeType,
      ContentLength: size
    })
  );

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey }),
    { expiresIn: ttl }
  );

  return {
    objectKey,
    signedUrl: signedUrl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    bytes: size,
    sha256: await sha256File(localPath),
    bucket: config.bucketName
  };
}

export async function uploadTextForRunpod({ content, runId, label }) {
  const config = await loadR2Config();
  if (!config) throw new Error("R2 is not configured.");
  const objectKey = `${LAB_KEY_PREFIX}/${runId}/${label}.txt`;
  const client = await createR2Client(config);
  const ttl = await signedUrlTtlSeconds();
  const body = Buffer.from(content, "utf8");
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: body,
      ContentType: "text/plain; charset=utf-8",
      ContentLength: body.length
    })
  );
  const signedUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey }), { expiresIn: ttl });
  return { objectKey, signedUrl, bytes: body.length };
}

/** Removes lab objects from R2. Failures are reported, never fatal. */
export async function cleanupLabObjects(objectKeys) {
  const keys = objectKeys.filter(Boolean);
  if (keys.length === 0) return { deleted: 0, failed: [] };
  const config = await loadR2Config();
  if (!config) return { deleted: 0, failed: keys };

  const client = await createR2Client(config);
  const failed = [];
  let deleted = 0;
  for (const key of keys) {
    if (!key.startsWith(`${LAB_KEY_PREFIX}/`)) {
      log.warn(`refusing to delete non-lab object key: ${key}`);
      failed.push(key);
      continue;
    }
    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
      deleted += 1;
    } catch (error) {
      failed.push(key);
      log.warn(`could not delete ${key}: ${error.message}`);
    }
  }
  return { deleted, failed };
}

export function describeSignedUrl(url) {
  return maskUrl(url);
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
