import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { mkdir, readdir, rm, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const renderTempRoot = process.env.RENDER_TEMP_ROOT || "/tmp/fullpos-video-studio";

@Injectable()
export class DiskGuardService {
  private activeRenders = 0;

  async assertSystemFreeSpace() {
    await assertFreeGb("/", envGb("MIN_SYSTEM_FREE_DISK_GB", 6), "Espacio insuficiente en el servidor.");
  }

  async createRenderWorkspace(estimatedGb = 1) {
    if (this.activeRenders >= envInt("MAX_RENDER_CONCURRENCY", 1)) {
      throw new ServiceUnavailableException("Ya hay un render en proceso. Inténtalo nuevamente en unos minutos.");
    }
    await cleanupStaleTemp();
    const minFree = envGb("MIN_RENDER_FREE_DISK_GB", 8) + Math.max(0, estimatedGb);
    await assertFreeGb("/", minFree, "Espacio temporal insuficiente en el servidor para procesar este video.");
    this.activeRenders += 1;
    const dir = path.join(renderTempRoot, `job-${Date.now()}-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
    return {
      dir,
      release: async () => {
        this.activeRenders = Math.max(0, this.activeRenders - 1);
        await rm(dir, { recursive: true, force: true });
      }
    };
  }
}

async function assertFreeGb(target: string, minGb: number, message: string) {
  const fs = await statfs(target);
  const freeBytes = Number(fs.bavail) * Number(fs.bsize);
  if (freeBytes < minGb * 1024 ** 3) throw new ServiceUnavailableException(message);
}

async function cleanupStaleTemp() {
  await mkdir(renderTempRoot, { recursive: true });
  const ttlMs = envInt("TEMP_WORKSPACE_TTL_HOURS", 24) * 60 * 60 * 1000;
  const now = Date.now();
  for (const entry of await readdir(renderTempRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("job-")) continue;
    const full = path.join(renderTempRoot, entry.name);
    const info = await stat(full).catch(() => undefined);
    if (info && now - info.mtimeMs > ttlMs) await rm(full, { recursive: true, force: true });
  }
}

function envGb(name: string, fallback: number) {
  const value = Number(process.env[name] ?? "");
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
