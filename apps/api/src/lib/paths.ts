import path from "node:path";

export const projectRoot = path.resolve(import.meta.dirname, "../../../..");
export const storageRoot = path.join(projectRoot, "storage");
export const uploadsRoot = path.join(storageRoot, "uploads");
export const rendersRoot = path.join(storageRoot, "renders");

export function assertInside(base: string, target: string) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Unsafe path rejected.");
  }
}
