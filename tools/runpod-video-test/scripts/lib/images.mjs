/**
 * FASE 5 / FASE 6 - input discovery + validation.
 *
 * Images are read-only: originals are never modified. Any transformation must
 * create a copy under the lab's temp folder.
 */
import { readFileSync, readdirSync, statSync, accessSync, constants } from "node:fs";
import path from "node:path";

export const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

const MIME_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Alphabetical (numeric-aware) list of candidate image files. */
export function discoverImageFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => SUPPORTED_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => collator.compare(a, b))
    .map((name) => path.join(dir, name));
}

export function sniffFormat(buffer) {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return undefined;
}

function pngDimensions(buffer) {
  if (buffer.length < 24) return undefined;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return undefined;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xda) return undefined;
    offset += 2 + length;
  }
  return undefined;
}

function webpDimensions(buffer) {
  if (buffer.length < 30) return undefined;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 ") {
    return { width: buffer.readUInt16LE(23) & 0x3fff, height: buffer.readUInt16LE(25) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return undefined;
}

function readHeaderDimensions(buffer, format) {
  if (format === "png") return pngDimensions(buffer);
  if (format === "jpeg") return jpegDimensions(buffer);
  if (format === "webp") return webpDimensions(buffer);
  return undefined;
}

/**
 * Validates a single image file.
 * Returns { ok, reason?, path, name, format, mimeType, width, height, bytes }.
 */
export function validateImageFile(filePath) {
  const base = { path: filePath, name: path.basename(filePath) };

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    return { ...base, ok: false, reason: "not found or not readable" };
  }
  try {
    accessSync(filePath, constants.R_OK);
  } catch {
    return { ...base, ok: false, reason: "not readable" };
  }
  if (!stats.isFile()) return { ...base, ok: false, reason: "not a regular file" };
  if (stats.size === 0) return { ...base, ok: false, reason: "zero bytes" };
  if (stats.size < 64) return { ...base, ok: false, reason: `suspiciously small (${stats.size} bytes)` };

  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return { ...base, ok: false, reason: "read failed" };
  }

  const format = sniffFormat(buffer);
  if (!format) {
    return { ...base, ok: false, bytes: stats.size, reason: "unrecognised or corrupt image (magic bytes mismatch)" };
  }

  const extension = path.extname(filePath).toLowerCase();
  const expected = extension === ".png" ? "png" : extension === ".jpg" || extension === ".jpeg" ? "jpeg" : "webp";
  const dimensions = readHeaderDimensions(buffer, format);

  return {
    ...base,
    ok: true,
    bytes: stats.size,
    format,
    mimeType: MIME_BY_FORMAT[format],
    width: dimensions?.width,
    height: dimensions?.height,
    extensionMismatch: expected !== format ? `extension ${extension} declares ${expected}, content is ${format}` : undefined
  };
}

/** Validates every candidate image, keeping the input order. */
export function validateImages(files) {
  return files.map((file) => validateImageFile(file));
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
