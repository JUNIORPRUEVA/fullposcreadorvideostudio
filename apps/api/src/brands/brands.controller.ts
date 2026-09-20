import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import multer from "multer";
import { tempRoot } from "../temp/temp-path.js";
import { BrandsService } from "./brands.service.js";

@Controller("brands")
export class BrandsController {
  constructor(@Inject(BrandsService) private readonly brands: BrandsService) {}

  @Get()
  findAll(@Query("includeArchived") includeArchived?: string) {
    return this.brands.findAll(includeArchived === "true");
  }

  @Get("default")
  defaultBrand() {
    return this.brands.defaultBrand();
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.brands.create(body);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.brands.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.brands.update(id, body);
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string) {
    return this.brands.duplicate(id);
  }

  @Post(":id/archive")
  archive(@Param("id") id: string) {
    return this.brands.archive(id);
  }

  @Post(":id/default")
  setDefault(@Param("id") id: string) {
    return this.brands.setDefault(id);
  }

  @Post(":id/assets")
  @UseInterceptors(FileInterceptor("file", { storage: multer.diskStorage({ destination: tempRoot }) }))
  uploadAsset(@Param("id") id: string, @Query("type") type: string, @UploadedFile() file?: Express.Multer.File) {
    return this.brands.saveAsset(id, type, file);
  }

  @Get(":id/export")
  exportBrand(@Param("id") id: string) {
    return this.brands.exportBrand(id);
  }

  @Post("import")
  importBrand(@Body() body: Record<string, unknown>) {
    return this.brands.importBrand(body);
  }
}
