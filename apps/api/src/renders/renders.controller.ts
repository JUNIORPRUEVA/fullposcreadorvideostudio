import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { rendersRoot } from "../lib/paths.js";
import { RenderService } from "./render.service.js";

@Controller("renders")
export class RendersController {
  constructor(@Inject(RenderService) private readonly renders: RenderService) {}

  @Get()
  findAll() {
    return this.renders.findAll();
  }

  @Post("style-preview")
  stylePreview(@Body() body: Record<string, unknown>) {
    return this.renders.renderStylePreview(body);
  }

  @Post("hybrid-preview")
  hybridPreview(@Body() body: Record<string, unknown>) {
    return this.renders.renderHybridPreview(body);
  }

  @Post("quick-tutorial-preview")
  quickTutorialPreview(@Body() body: Record<string, unknown>) {
    return this.renders.renderQuickTutorialPreview(body);
  }

  @Post("course-scene-preview")
  courseScenePreview(@Body() body: Record<string, unknown>) {
    return this.renders.renderCourseScenePreview(body);
  }

  @Get("style-preview/:id/stream")
  stylePreviewStream(@Param("id") id: string, @Res() response: Response) {
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    const file = path.join(rendersRoot, safeId, "final.mp4");
    if (!existsSync(file)) throw new NotFoundException("Style preview not found.");
    response.setHeader("Content-Type", "video/mp4");
    response.setHeader("Content-Disposition", "inline");
    return response.sendFile(file);
  }

  @Get("hybrid-preview/:id/stream")
  hybridPreviewStream(@Param("id") id: string, @Res() response: Response) {
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    const file = path.join(rendersRoot, safeId, "final.mp4");
    if (!existsSync(file)) throw new NotFoundException("Hybrid preview not found.");
    response.setHeader("Content-Type", "video/mp4");
    response.setHeader("Content-Disposition", "inline");
    return response.sendFile(file);
  }

  @Get("preview/:id/stream")
  previewStream(@Param("id") id: string, @Res() response: Response) {
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    const file = path.join(rendersRoot, safeId, "final.mp4");
    if (!existsSync(file)) throw new NotFoundException("Preview not found.");
    response.setHeader("Content-Type", "video/mp4");
    response.setHeader("Content-Disposition", "inline");
    return response.sendFile(file);
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const job = await this.renders.findOne(id);
    if (!job) throw new NotFoundException("Render job not found.");
    return job;
  }

  @Get(":id/file")
  async file(@Param("id") id: string, @Res() response: Response) {
    const job = await this.renders.findOne(id);
    if (!job?.outputPath || job.status !== "COMPLETED" || !existsSync(job.outputPath)) {
      throw new NotFoundException("Rendered file not found.");
    }
    return response.download(job.outputPath, "fullpos-ad-studio.mp4");
  }

  @Get(":id/stream")
  async stream(@Param("id") id: string, @Res() response: Response) {
    const job = await this.renders.findOne(id);
    if (!job?.outputPath || job.status !== "COMPLETED" || !existsSync(job.outputPath)) {
      throw new NotFoundException("Rendered file not found.");
    }
    response.setHeader("Content-Type", "video/mp4");
    response.setHeader("Content-Disposition", "inline");
    return response.sendFile(job.outputPath);
  }
}
