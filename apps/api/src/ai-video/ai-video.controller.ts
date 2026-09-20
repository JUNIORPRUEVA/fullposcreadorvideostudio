import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { existsSync } from "node:fs";
import { AiVideoService } from "./ai-video.service.js";

@Controller()
export class AiVideoController {
  constructor(@Inject(AiVideoService) private readonly aiVideo: AiVideoService) {}

  @Get("ai-video/profiles")
  profiles() {
    return this.aiVideo.profiles();
  }

  @Get("ai-video/transport/status")
  transportStatus() {
    return this.aiVideo.transportStatus();
  }

  @Post("ai-video/transport/prepare")
  prepareTransport() {
    return this.aiVideo.prepareTransport();
  }

  @Post("ai-video/transport/stop")
  stopTransport() {
    return this.aiVideo.stopTransport();
  }

  @Get("projects/:projectId/ai-video/jobs")
  jobs(@Param("projectId") projectId: string) {
    return this.aiVideo.jobs(projectId);
  }

  @Post("projects/:projectId/ai-video/quote")
  quote(@Param("projectId") projectId: string, @Body() body: Record<string, unknown>) {
    return this.aiVideo.quote(projectId, body);
  }

  @Post("projects/:projectId/ai-video/generate")
  generate(@Param("projectId") projectId: string, @Body() body: Record<string, unknown>) {
    return this.aiVideo.generate(projectId, body);
  }

  @Get("projects/:projectId/ai-video/:jobId/file")
  async file(@Param("projectId") projectId: string, @Param("jobId") jobId: string, @Res() response: Response) {
    const job = await this.aiVideo.findJob(projectId, jobId);
    if (!job.outputPath || job.status !== "COMPLETED" || !existsSync(job.outputPath)) {
      throw new NotFoundException("AI video file not found.");
    }
    return response.download(job.outputPath, "fullpos-ai-video.mp4");
  }
}
