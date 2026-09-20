import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import { tempRoot } from "../temp/temp-path.js";
import { ProjectsService } from "./projects.service.js";
import { validateAssetUpload } from "./validation.js";
import { RenderService } from "../renders/render.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projects: ProjectsService,
    @Inject(RenderService)
    private readonly renders: RenderService
  ) {}

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.projects.create(body);
  }

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projects.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.projects.update(id, body);
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string) {
    return this.projects.duplicate(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.projects.remove(id);
  }

  @Post(":id/assets")
  @UseInterceptors(FileInterceptor("file", { storage: multer.diskStorage({ destination: tempRoot }) }))
  uploadAsset(@Param("id") id: string, @Query("type") type: string, @UploadedFile() file?: Express.Multer.File) {
    validateAssetUpload(type, file);
    return this.projects.saveAsset(id, type, file);
  }

  @Post(":id/scenes")
  createScene(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.projects.createScene(id, body);
  }

  @Patch(":id/scenes/:sceneId")
  updateScene(@Param("id") id: string, @Param("sceneId") sceneId: string, @Body() body: Record<string, unknown>) {
    return this.projects.updateScene(id, sceneId, body);
  }

  @Post(":id/scenes/:sceneId/duplicate")
  duplicateScene(@Param("id") id: string, @Param("sceneId") sceneId: string) {
    return this.projects.duplicateScene(id, sceneId);
  }

  @Delete(":id/scenes/:sceneId")
  removeScene(@Param("id") id: string, @Param("sceneId") sceneId: string) {
    return this.projects.removeScene(id, sceneId);
  }

  @Post(":id/scenes/reorder")
  reorderScenes(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.projects.reorderScenes(id, body);
  }

  @Post(":id/music")
  @UseInterceptors(FileInterceptor("file", { storage: multer.diskStorage({ destination: tempRoot }) }))
  uploadMusic(@Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.projects.saveMusic(id, file);
  }

  @Post(":id/voice-reference")
  @UseInterceptors(FileInterceptor("file", { storage: multer.diskStorage({ destination: tempRoot }) }))
  uploadVoiceReference(@Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.projects.saveVoiceReference(id, file);
  }

  @Get(":id/music/file")
  async musicFile(@Param("id") id: string, @Res() response: Response) {
    const project = await this.projects.findOne(id);
    const file = project.customMusicPath ?? project.musicPath;
    if (!file || !existsSync(file)) throw new NotFoundException("Project music file not found.");
    response.setHeader("Content-Type", contentTypeFor(file));
    return response.sendFile(file);
  }

  @Post(":id/render")
  render(@Param("id") id: string) {
    return this.renders.enqueue(id);
  }
}

function contentTypeFor(file: string) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  return "audio/wav";
}
