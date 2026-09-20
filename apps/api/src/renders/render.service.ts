import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { renderFullPosVideo } from "@fullpos-ad-studio/video";
import type { AssetType, RenderPayload } from "@fullpos-ad-studio/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { rendersRoot } from "../lib/paths.js";

@Injectable()
export class RenderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enqueue(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { assets: true }
    });
    if (!project) throw new NotFoundException("Project not found.");

    const job = await this.prisma.renderJob.create({
      data: {
        projectId,
        status: "QUEUED",
        progress: 0
      }
    });

    void this.run(job.id).catch(async (error: unknown) => {
      await this.prisma.renderJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown render error.",
          completedAt: new Date()
        }
      });
    });

    return job;
  }

  findOne(id: string) {
    return this.prisma.renderJob.findUnique({ where: { id } });
  }

  async run(jobId: string) {
    const job = await this.prisma.renderJob.findUnique({
      where: { id: jobId },
      include: {
        project: {
          include: { assets: true }
        }
      }
    });
    if (!job) throw new NotFoundException("Render job not found.");

    await this.prisma.renderJob.update({
      where: { id: jobId },
      data: { status: "RENDERING", progress: 1, startedAt: new Date() }
    });

    const assets: Partial<Record<AssetType, string>> = {};
    for (const asset of job.project.assets) {
      assets[asset.type as AssetType] = asset.path;
    }

    const payload: RenderPayload = {
      projectId: job.projectId,
      template: "fullpos-premium-vertical",
      format: "9:16",
      fps: 30,
      durationSeconds: 25,
      brand: {
        name: job.project.productName,
        headline: job.project.headline,
        subheadline: job.project.subheadline ?? undefined,
        offer: job.project.offer,
        price: job.project.price,
        website: job.project.website
      },
      assets
    };

    const outputPath = await renderFullPosVideo(payload, {
      renderId: jobId,
      outputRoot: rendersRoot,
      onProgress: async (progress) => {
        await this.prisma.renderJob.update({
          where: { id: jobId },
          data: { progress: Math.max(1, Math.min(99, progress)) }
        });
      }
    });

    return this.prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        outputPath,
        completedAt: new Date()
      }
    });
  }
}
