import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertInside, uploadsRoot } from "../lib/paths.js";
import { validateProjectInput, type ProjectInput } from "./validation.js";

const includeProject = {
  assets: true,
  renderJobs: {
    orderBy: { createdAt: "desc" as const },
    take: 5
  }
};

@Injectable()
export class ProjectsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(body: Record<string, unknown>) {
    const input = validateProjectInput(body) as ProjectInput;
    return this.prisma.project.create({
      data: {
        name: input.name,
        productName: input.productName ?? "FullPOS Cloud",
        headline: input.headline,
        subheadline: input.subheadline,
        offer: input.offer,
        price: input.price,
        website: input.website,
        template: input.template ?? "fullpos-premium-vertical",
        format: input.format ?? "9:16"
      },
      include: includeProject
    });
  }

  findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: includeProject
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: includeProject });
    if (!project) throw new NotFoundException("Project not found.");
    return project;
  }

  async update(id: string, body: Record<string, unknown>) {
    await this.findOne(id);
    const input = validateProjectInput(body, true);
    return this.prisma.project.update({
      where: { id },
      data: input,
      include: includeProject
    });
  }

  async saveAsset(projectId: string, type: string, file: Express.Multer.File) {
    await this.findOne(projectId);
    const extension = extensionForMime(file.mimetype);
    const filename = `${type}-${randomUUID()}${extension}`;
    const projectUploadDir = path.join(uploadsRoot, projectId);
    const finalPath = path.join(projectUploadDir, filename);

    assertInside(uploadsRoot, finalPath);
    await mkdir(projectUploadDir, { recursive: true });
    await rename(file.path, finalPath);

    return this.prisma.asset.create({
      data: {
        projectId,
        type,
        filename,
        path: finalPath,
        mimeType: file.mimetype
      }
    });
  }
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}
