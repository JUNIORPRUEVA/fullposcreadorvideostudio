import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "../lib/paths.js";

export function readRunpodApiKey() {
  return resolveRunpodApiKey({
    env: process.env,
    envFileContent: readApiEnvFile()
  });
}

export function resolveRunpodApiKey({ env, envFileContent }: { env: NodeJS.ProcessEnv | Record<string, string | undefined>; envFileContent?: string }) {
  const fromProcess = cleanValue(env.RUNPOD_API_KEY);
  if (fromProcess) return fromProcess;

  for (const line of (envFileContent ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*RUNPOD_API_KEY\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = cleanValue(match[1]);
    if (value) return value;
  }
  return undefined;
}

function readApiEnvFile() {
  try {
    return readFileSync(path.join(projectRoot, "apps", "api", ".env"), "utf8");
  } catch {
    return "";
  }
}

function cleanValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") || undefined;
}

