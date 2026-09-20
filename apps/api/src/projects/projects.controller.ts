import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
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

  @Post(":id/assets")
  @UseInterceptors(FileInterceptor("file", { storage: multer.diskStorage({ destination: tempRoot }) }))
  uploadAsset(@Param("id") id: string, @Query("type") type: string, @UploadedFile() file?: Express.Multer.File) {
    validateAssetUpload(type, file);
    return this.projects.saveAsset(id, type, file);
  }

  @Post(":id/render")
  render(@Param("id") id: string) {
    return this.renders.enqueue(id);
  }
}
