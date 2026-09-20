import { Injectable } from "@nestjs/common";
import type { Asset } from "@prisma/client";
import { aiSceneTemplates, type AiVideoSceneId } from "./ai-video.profiles.js";
import { createAiAssetToken } from "./ai-asset-token-store.js";
import { AiAssetGatewayService } from "./ai-asset-gateway.service.js";

export interface PreparedAiImage {
  ok: boolean;
  imageUrl?: string;
  localPath?: string;
  expiresAt?: string;
  objectKey?: string;
  localSha256?: string;
  downloadedSha256?: string;
  contentType?: string;
  contentLength?: number;
  reason?: string;
}

export interface AiAssetTransport {
  prepareImage(projectId: string, scene: AiVideoSceneId, assets: Asset[]): Promise<PreparedAiImage>;
}

@Injectable()
export class TemporaryTunnelAiAssetTransport implements AiAssetTransport {
  constructor(private readonly gateway: AiAssetGatewayService) {}

  async prepareImage(_projectId: string, scene: AiVideoSceneId, assets: Asset[]): Promise<PreparedAiImage> {
    const template = aiSceneTemplates[scene];
    const asset = assets.find((item) => item.type === template.assetType);
    if (!asset) {
      return {
        ok: false,
        reason: `Falta la imagen requerida para ${template.label}.`
      };
    }

    const publicBaseUrl = await this.gateway.publicBaseUrl();
    if (!publicBaseUrl) {
      return {
        ok: false,
        localPath: asset.path,
        reason: "La imagen existe localmente, pero el transporte temporal no está listo. Usa Preparar conexión IA para iniciar el gateway dedicado y el túnel HTTPS."
      };
    }

    const token = await createAiAssetToken({ assetPath: asset.path, mimeType: asset.mimeType });
    return {
      ok: true,
      localPath: asset.path,
      imageUrl: `${publicBaseUrl}/asset/${token.token}`,
      expiresAt: token.expiresAt
    };
  }
}
