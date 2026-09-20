import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertInside, storageRoot, uploadsRoot } from "../lib/paths.js";

export const AI_ASSET_TOKEN_TTL_MS = 10 * 60 * 1000;
export const AI_ASSET_MAX_BYTES = 12 * 1024 * 1024;
export const aiAssetTokenStorePath = path.join(storageRoot, "temp", "ai-asset-tokens.json");

const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface AiAssetTokenRecord {
  token: string;
  assetPath: string;
  mimeType: string;
  expiresAt: string;
  usedAt?: string;
}

export async function createAiAssetToken(input: { assetPath: string; mimeType: string; ttlMs?: number }) {
  validateAiAssetFile(input.assetPath, input.mimeType);
  const token = randomBytes(32).toString("hex");
  const records = await readTokenStore();
  const record: AiAssetTokenRecord = {
    token,
    assetPath: input.assetPath,
    mimeType: input.mimeType,
    expiresAt: new Date(Date.now() + (input.ttlMs ?? AI_ASSET_TOKEN_TTL_MS)).toISOString()
  };
  records[token] = record;
  await writeTokenStore(removeExpired(records));
  return record;
}

export async function getAiAssetToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
  const records = await readTokenStore();
  const record = records[token];
  if (!record) return undefined;
  if (Date.parse(record.expiresAt) <= Date.now()) return { ...record, expired: true };
  validateAiAssetFile(record.assetPath, record.mimeType);
  return { ...record, expired: false };
}

export async function markAiAssetTokenUsed(token: string) {
  const records = await readTokenStore();
  if (!records[token]) return;
  records[token].usedAt = new Date().toISOString();
  await writeTokenStore(removeExpired(records));
}

export async function invalidateAiAssetToken(token: string) {
  const records = await readTokenStore();
  delete records[token];
  await writeTokenStore(removeExpired(records));
}

export async function readTokenStore(): Promise<Record<string, AiAssetTokenRecord>> {
  try {
    return JSON.parse(await readFile(aiAssetTokenStorePath, "utf8")) as Record<string, AiAssetTokenRecord>;
  } catch {
    return {};
  }
}

function validateAiAssetFile(assetPath: string, mimeType: string) {
  assertInside(uploadsRoot, assetPath);
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error("Unsupported AI asset mime type.");
  }
  const extension = path.extname(assetPath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error("Unsupported AI asset extension.");
  }
  if (!existsSync(assetPath)) {
    throw new Error("AI asset does not exist.");
  }
  const stat = statSync(assetPath);
  if (!stat.isFile()) {
    throw new Error("AI asset must be a file.");
  }
  if (stat.size <= 0 || stat.size > AI_ASSET_MAX_BYTES) {
    throw new Error("AI asset file size is not allowed.");
  }
}

function removeExpired(records: Record<string, AiAssetTokenRecord>) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(records).filter(([, record]) => Date.parse(record.expiresAt) > now));
}

async function writeTokenStore(records: Record<string, AiAssetTokenRecord>) {
  await mkdir(path.dirname(aiAssetTokenStorePath), { recursive: true });
  await writeFile(aiAssetTokenStorePath, JSON.stringify(records, null, 2));
}

