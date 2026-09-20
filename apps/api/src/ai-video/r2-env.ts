import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "../lib/paths.js";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

const names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_ENDPOINT"] as const;

export function readR2Config() {
  return resolveR2Config({ env: process.env, envFileContent: readApiEnvFile() });
}

export function r2EnvPresence() {
  const envFileContent = readApiEnvFile();
  const parsed = parseEnvFile(envFileContent);
  return Object.fromEntries(names.map((name) => [name, Boolean(cleanValue(process.env[name] ?? parsed[name]))]));
}

export function resolveR2Config({ env, envFileContent }: { env: NodeJS.ProcessEnv | Record<string, string | undefined>; envFileContent?: string }) {
  const parsed = parseEnvFile(envFileContent ?? "");
  const values = Object.fromEntries(names.map((name) => [name, cleanValue(env[name] ?? parsed[name])])) as Record<(typeof names)[number], string | undefined>;
  if (!values.R2_ACCOUNT_ID || !values.R2_ACCESS_KEY_ID || !values.R2_SECRET_ACCESS_KEY || !values.R2_BUCKET_NAME || !values.R2_ENDPOINT) {
    return undefined;
  }
  return {
    accountId: values.R2_ACCOUNT_ID,
    accessKeyId: values.R2_ACCESS_KEY_ID,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY,
    bucketName: values.R2_BUCKET_NAME,
    endpoint: values.R2_ENDPOINT.replace("<ACCOUNT_ID>", values.R2_ACCOUNT_ID)
  } satisfies R2Config;
}

function readApiEnvFile() {
  try {
    return readFileSync(path.join(projectRoot, "apps", "api", ".env"), "utf8");
  } catch {
    return "";
  }
}

function parseEnvFile(content: string) {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function cleanValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") || undefined;
}
