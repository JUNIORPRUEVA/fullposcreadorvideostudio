import { mkdirSync } from "node:fs";
import { storageRoot } from "../lib/paths.js";
import path from "node:path";

export const tempRoot = path.join(storageRoot, "temp");
mkdirSync(tempRoot, { recursive: true });
