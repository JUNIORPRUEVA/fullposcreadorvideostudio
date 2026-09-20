export const PRODUCT_NAME = "FullPOS Cloud";

export const allowedAssetMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;

export type AssetType = "logo" | "billing" | "products" | "reports" | "mobile" | "additional";
export type RenderStatus = "QUEUED" | "RENDERING" | "COMPLETED" | "FAILED";
export type AdFormat = "9:16" | "16:9" | "1:1";

export interface RenderPayload {
  projectId: string;
  template: "fullpos-premium-vertical";
  format: AdFormat;
  fps: number;
  durationSeconds: number;
  brand: {
    name: string;
    headline: string;
    subheadline?: string;
    offer: string;
    price: string;
    website: string;
  };
  assets: Partial<Record<AssetType, string>>;
  audio?: {
    voiceOverPath?: string;
    musicPath?: string;
    musicVolume?: number;
    voiceVolume?: number;
  };
}
