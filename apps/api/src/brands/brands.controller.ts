import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { existsSync } from "node:fs";
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

  @Post(":id/restore")
  restore(@Param("id") id: string) {
    return this.brands.restore(id);
  }

  @Post(":id/default")
  setDefault(@Param("id") id: string) {
    return this.brands.setDefault(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.brands.remove(id);
  }

  @Post(":id/reassign-and-delete")
  reassignAndDelete(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.brands.reassignAndDelete(id, body);
  }

  @Post(":id/assets")
  @UseInterceptors(FileInterceptor("file", { storage: multer.diskStorage({ destination: tempRoot }) }))
  uploadAsset(@Param("id") id: string, @Query("type") type: string, @UploadedFile() file?: Express.Multer.File) {
    return this.brands.saveAsset(id, type, file);
  }

  @Post(":id/assets/upload-intent")
  createAssetUploadIntent(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.brands.createAssetUploadIntent(id, body);
  }

  @Post(":id/assets/complete-upload")
  completeAssetUpload(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.brands.completeAssetUpload(id, body);
  }

  @Get(":id/assets/:assetId/file")
  async assetFile(@Param("id") id: string, @Param("assetId") assetId: string, @Res() response: Response) {
    return this.sendBrandImageOrFile(id, assetId, response, false);
  }

  @Get(":id/assets/:assetId/public-image")
  async publicImage(@Param("id") id: string, @Param("assetId") assetId: string, @Res() response: Response) {
    return this.sendBrandImageOrFile(id, assetId, response, true);
  }

  private async sendBrandImageOrFile(id: string, assetId: string, response: Response, imageOnly: boolean) {
    const asset = await this.brands.findAsset(id, assetId);
    if (imageOnly && !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) throw new NotFoundException("Brand image not found.");
    const signedUrl = await this.brands.signedAssetUrl(asset);
    if (signedUrl) {
      response.setHeader("Cache-Control", "no-store");
      return response.redirect(302, signedUrl);
    }
    if (!asset || !existsSync(asset.path)) throw new NotFoundException("Brand asset file not found.");
    response.setHeader("Content-Type", asset.mimeType);
    response.setHeader("Cache-Control", "no-store");
    return response.sendFile(asset.path);
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
