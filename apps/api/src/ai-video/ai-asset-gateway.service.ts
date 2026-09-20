import { Injectable } from "@nestjs/common";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot, storageRoot } from "../lib/paths.js";

const LOCAL_GATEWAY_URL = "http://localhost:4100";
const statePath = path.join(storageRoot, "temp", "ai-asset-gateway-state.json");
const logsDir = path.join(storageRoot, "temp", "logs");

interface GatewayState {
  gatewayPid?: number;
  tunnelPid?: number;
  publicBaseUrl?: string;
  updatedAt?: string;
}

@Injectable()
export class AiAssetGatewayService {
  async prepare() {
    await this.ensureLocalGateway();
    const cloudflaredAvailable = this.isCloudflaredAvailable();
    if (!cloudflaredAvailable) {
      const state = await this.readState();
      return this.statusFromState({ ...state, publicBaseUrl: undefined }, cloudflaredAvailable);
    }

    const state = await this.ensureTunnel();
    return this.statusFromState(state, cloudflaredAvailable);
  }

  async status() {
    const state = await this.readState();
    return this.statusFromState(state, this.isCloudflaredAvailable());
  }

  async stop() {
    const state = await this.readState();
    if (state.tunnelPid) this.killProcessTree(state.tunnelPid);
    if (state.gatewayPid) this.killProcessTree(state.gatewayPid);
    await this.writeState({});
    return this.statusFromState({}, this.isCloudflaredAvailable());
  }

  async publicBaseUrl() {
    const status = await this.status();
    return status.ready ? status.publicBaseUrl : undefined;
  }

  private async ensureLocalGateway() {
    const state = await this.readState();
    if (await this.localGatewayResponds()) return state;

    await mkdir(logsDir, { recursive: true });
    const child = this.startBackgroundCommand(
      "set AI_ASSET_GATEWAY_START=1&& npm.cmd run asset-gateway:dev --workspace @fullpos-ad-studio/api",
      "ai-asset-gateway"
    );
    child.unref();
    const next = { ...state, gatewayPid: child.pid, updatedAt: new Date().toISOString() };
    await this.writeState(next);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await this.localGatewayResponds()) return next;
      await delay(500);
    }
    return next;
  }

  private async ensureTunnel() {
    const current = await this.readState();
    if (current.publicBaseUrl && current.tunnelPid && this.isPidRunning(current.tunnelPid)) return current;

    await mkdir(logsDir, { recursive: true });
    const outPath = path.join(logsDir, "ai-asset-tunnel.out.log");
    const errPath = path.join(logsDir, "ai-asset-tunnel.err.log");
    const child = this.startBackgroundCommand(`cloudflared tunnel --url ${LOCAL_GATEWAY_URL} --no-autoupdate`, "ai-asset-tunnel");
    child.unref();

    const next = { ...current, tunnelPid: child.pid, publicBaseUrl: undefined, updatedAt: new Date().toISOString() };
    await this.writeState(next);

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const url = await this.findTunnelUrl(outPath, errPath);
      if (url) {
        const ready = { ...next, publicBaseUrl: url, updatedAt: new Date().toISOString() };
        await this.writeState(ready);
        return ready;
      }
      await delay(1000);
    }
    return next;
  }

  private async statusFromState(state: GatewayState, cloudflaredAvailable: boolean) {
    const localGatewayReady = await this.localGatewayResponds();
    const tunnelReady = Boolean(state.publicBaseUrl && state.tunnelPid && this.isPidRunning(state.tunnelPid));
    return {
      ready: localGatewayReady && tunnelReady,
      localPort: 4100,
      localGatewayReady,
      cloudflaredAvailable,
      tunnelReady,
      publicBaseUrl: tunnelReady ? state.publicBaseUrl : undefined,
      gatewayPid: state.gatewayPid,
      tunnelPid: state.tunnelPid
    };
  }

  private isCloudflaredAvailable() {
    return spawnSync("cloudflared", ["--version"], { windowsHide: true }).status === 0;
  }

  private async localGatewayResponds() {
    try {
      const response = await fetch(`${LOCAL_GATEWAY_URL}/asset/${"0".repeat(64)}`, { signal: AbortSignal.timeout(1500) });
      return response.status === 404 || response.status === 410;
    } catch {
      return false;
    }
  }

  private async findTunnelUrl(...files: string[]) {
    for (const file of files) {
      if (!existsSync(file)) continue;
      const content = await readFile(file, "utf8").catch(() => "");
      const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) return match[0];
    }
    return undefined;
  }

  private isPidRunning(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private killProcessTree(pid: number) {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  }

  private startBackgroundCommand(command: string, logName: string) {
    void logName;
    const child = spawn("cmd.exe", ["/d", "/c", command], {
      cwd: projectRoot,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return child;
  }

  private async readState(): Promise<GatewayState> {
    try {
      return JSON.parse(await readFile(statePath, "utf8")) as GatewayState;
    } catch {
      return {};
    }
  }

  private async writeState(state: GatewayState) {
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(state, null, 2));
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
