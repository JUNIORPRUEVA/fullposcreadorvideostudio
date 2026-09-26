/**
 * FASE 28 - resumability.
 *
 * A completed, probe-validated clip is never regenerated (that would cost money
 * again). `--force` is the only way to overwrite it. The state file lives under
 * the ignored `temp/` folder.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { statePath, tempDir } from "./paths.mjs";

const VERSION = 1;

export async function loadState() {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.runs)) return parsed;
  } catch {
    /* first run, or state was removed */
  }
  return { version: VERSION, createdAt: new Date().toISOString(), runs: [] };
}

export async function saveState(state) {
  await mkdir(tempDir, { recursive: true });
  state.version = VERSION;
  state.updatedAt = new Date().toISOString();
  const temporary = `${statePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, statePath);
  return state;
}

export function findRun(state, imageName, profileId) {
  return state.runs.find((run) => run.image === imageName && run.profile === profileId);
}

export function recordRun(state, record) {
  const index = state.runs.findIndex((run) => run.image === record.image && run.profile === record.profile);
  const entry = { ...record, updatedAt: new Date().toISOString() };
  if (index >= 0) state.runs[index] = { ...state.runs[index], ...entry };
  else state.runs.push(entry);
  return entry;
}

/** A run counts as reusable only when it finished, produced a file and probed cleanly. */
export function isReusableRun(run, { clipPath, probeOk }) {
  return Boolean(run && run.status === "COMPLETED" && run.clipPath === clipPath && probeOk);
}

export function describeRun(run) {
  if (!run) return "no record";
  const seconds = run.elapsedMs ? `${(run.elapsedMs / 1000).toFixed(1)}s` : "n/a";
  return `${run.status} job=${run.jobId ?? "n/a"} elapsed=${seconds}${run.attempts > 1 ? ` attempts=${run.attempts}` : ""}`;
}

export function stateFilePath() {
  return path.relative(process.cwd(), statePath).split(path.sep).join("/");
}
