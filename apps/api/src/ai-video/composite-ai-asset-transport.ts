import { Injectable } from "@nestjs/common";
import type { Asset } from "@prisma/client";
import type { AiVideoSceneId } from "./ai-video.profiles.js";
import type { AiAssetTransport } from "./ai-asset-transport.js";
import { R2SignedUrlAiAssetTransport } from "./r2-signed-url-ai-asset-transport.js";
import { TemporaryTunnelAiAssetTransport } from "./ai-asset-transport.js";

@Injectable()
export class CompositeAiAssetTransport implements AiAssetTransport {
  constructor(
    private readonly r2: R2SignedUrlAiAssetTransport,
    private readonly tunnel: TemporaryTunnelAiAssetTransport
  ) {}

  async prepareImage(projectId: string, scene: AiVideoSceneId, assets: Asset[]) {
    if (this.r2.isConfigured()) {
      return this.r2.prepareImage(projectId, scene, assets);
    }
    return this.tunnel.prepareImage(projectId, scene, assets);
  }

  preferredProvider() {
    return this.r2.isConfigured() ? "r2-signed-url" : "temporary-tunnel";
  }
}

