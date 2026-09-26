import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import "../lib/env.js";
import { projectRoot } from "../lib/paths.js";

process.env.DATABASE_URL ??= `file:${path.join(projectRoot, "apps", "api", "prisma", "dev.db").replaceAll("\\", "/")}`;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
