import { Controller, Get, Inject, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { existsSync } from "node:fs";
import { RenderService } from "./render.service.js";

@Controller("renders")
export class RendersController {
  constructor(@Inject(RenderService) private readonly renders: RenderService) {}

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
}
