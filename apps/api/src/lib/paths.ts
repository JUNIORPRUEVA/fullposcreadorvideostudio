import path from "node:path";

export const projectRoot = path.resolve(import.meta.dirname, "../../../..");
export const storageRoot = path.join(projectRoot, "storage");
export const uploadsRoot = path.join(storageRoot, "uploads");
export const rendersRoot = path.join(storageRoot, "renders");
export const audioRoot = path.join(storageRoot, "audio");
export const aiVideoRoot = path.join(storageRoot, "ai-video");
// Narraciones generadas por FullPOS Voice Studio (Fase 1). El motor de voz escribe
// aqui; el API solo lee para servir el reproductor y la descarga.
export const generatedAudioRoot = path.join(storageRoot, "generated-audio");

export function assertInside(base: string, target: string) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Unsafe path rejected.");
  }
}
