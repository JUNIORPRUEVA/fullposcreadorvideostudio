import path from "node:path";
import { projectRoot } from "./paths.js";

const apiEnvPath = path.join(projectRoot, "apps", "api", ".env");

try {
  process.loadEnvFile(apiEnvPath);
} catch {
  // Local development can still run with explicit environment variables.
}
