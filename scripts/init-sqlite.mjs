import path from "node:path";
import { pathToFileURL } from "node:url";

const dbPath = path.resolve("apps/api/prisma/dev.db").replaceAll("\\", "/");
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.RUST_LOG ??= "info";

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "headline" TEXT NOT NULL,
  "subheadline" TEXT,
  "offer" TEXT NOT NULL,
  "price" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
)`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "RenderJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "outputPath" TEXT,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);

await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Asset_projectId_idx" ON "Asset"("projectId")`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RenderJob_projectId_idx" ON "RenderJob"("projectId")`);
await prisma.$disconnect();

console.log(`SQLite database initialized at ${pathToFileURL(dbPath).href}`);
