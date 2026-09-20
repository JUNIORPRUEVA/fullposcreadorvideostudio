import { BadRequestException } from "@nestjs/common";
import { allowedAssetMimeTypes, type AdFormat, type AssetType } from "@fullpos-ad-studio/shared";

export const assetTypes: AssetType[] = ["logo", "billing", "products", "reports", "mobile", "additional"];
export const adFormats: AdFormat[] = ["9:16", "16:9", "1:1"];

export interface ProjectInput {
  name: string;
  productName?: string;
  headline: string;
  subheadline?: string;
  offer: string;
  price: string;
  website: string;
  template?: string;
  format?: AdFormat;
}

function cleanString(value: unknown, field: string, required = true) {
  if (value === undefined || value === null || value === "") {
    if (!required) return undefined;
    throw new BadRequestException(`${field} is required.`);
  }
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed && required) {
    throw new BadRequestException(`${field} is required.`);
  }
  if (trimmed.length > 240) {
    throw new BadRequestException(`${field} is too long.`);
  }
  return trimmed;
}

export function validateProjectInput(body: Record<string, unknown>, partial = false): Partial<ProjectInput> {
  const input: Partial<ProjectInput> = {};
  const required = !partial;

  for (const field of ["name", "headline", "offer", "price", "website"] as const) {
    const value = cleanString(body[field], field, required);
    if (value !== undefined) input[field] = value;
  }

  const productName = cleanString(body.productName, "productName", false);
  if (productName !== undefined) input.productName = productName;

  const subheadline = cleanString(body.subheadline, "subheadline", false);
  if (subheadline !== undefined) input.subheadline = subheadline;

  const template = cleanString(body.template, "template", false);
  input.template = template ?? "fullpos-premium-vertical";
  if (input.template !== "fullpos-premium-vertical") {
    throw new BadRequestException("Unsupported template.");
  }

  const format = (body.format ?? "9:16") as AdFormat;
  if (!adFormats.includes(format)) {
    throw new BadRequestException("Unsupported format.");
  }
  input.format = format;

  return input;
}

export function validateAssetUpload(type: string | undefined, file?: Express.Multer.File): asserts file is Express.Multer.File {
  if (!type || !assetTypes.includes(type as AssetType)) {
    throw new BadRequestException("Unsupported asset type.");
  }
  if (!file) {
    throw new BadRequestException("File is required.");
  }
  if (!allowedAssetMimeTypes.includes(file.mimetype as (typeof allowedAssetMimeTypes)[number])) {
    throw new BadRequestException("Unsupported file type. Use PNG, JPG, JPEG, or WEBP.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new BadRequestException("File is too large. Maximum size is 10MB.");
  }
}
