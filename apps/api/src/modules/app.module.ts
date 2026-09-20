import { Module } from "@nestjs/common";
import { ProjectsController } from "../projects/projects.controller.js";
import { ProjectsService } from "../projects/projects.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RendersController } from "../renders/renders.controller.js";
import { RenderService } from "../renders/render.service.js";

@Module({
  controllers: [ProjectsController, RendersController],
  providers: [PrismaService, ProjectsService, RenderService]
})
export class AppModule {}
