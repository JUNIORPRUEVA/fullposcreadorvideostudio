// FullPOS Video Studio - database safety guard.
//
// Local development uses the SAME database configuration the project already uses
// (apps/api/.env -> DATABASE_URL, reached through the studio SSH tunnel). The F5 /
// dev startup path must never run migrations, seeds, resets or schema pushes.
//
// Destructive scripts call assertDestructiveDbAllowed() so they can only run when a
// human explicitly opts in with STUDIO_ALLOW_DESTRUCTIVE_DB=1.
//
// Production behavior is intentionally untouched: when NODE_ENV=production the guard
// only logs and returns, so existing deploy/tooling flows keep working.

import { pathToFileURL } from "node:url";

const OVERRIDE_FLAG = "STUDIO_ALLOW_DESTRUCTIVE_DB";

export function destructiveDbAllowed(env = process.env) {
  const nodeEnv = String(env.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "production") return true;
  const override = String(env[OVERRIDE_FLAG] ?? "").trim().toLowerCase();
  return override === "1" || override === "true" || override === "yes";
}

export function assertDestructiveDbAllowed(operation, env = process.env) {
  const nodeEnv = String(env.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "production") {
    console.warn(`[db-guard] NODE_ENV=production: keeping the previous behavior for "${operation}".`);
    return;
  }
  if (destructiveDbAllowed(env)) {
    console.warn(`[db-guard] "${operation}" explicitly allowed by ${OVERRIDE_FLAG}.`);
    return;
  }
  console.error(
    [
      "",
      `[db-guard] BLOCKED: "${operation}" would change database structure or data.`,
      "",
      "  This workspace develops against the SAME database configured in apps/api/.env.",
      "  Migrations, seeds, resets and schema pushes are not allowed from the dev startup",
      "  flow, and must never be triggered accidentally while pressing F5.",
      "",
      "  If you really mean it, opt in explicitly:",
      "",
      `    PowerShell:  $env:${OVERRIDE_FLAG}=1; npm run <script>`,
      `    bash:        ${OVERRIDE_FLAG}=1 npm run <script>`,
      "",
      "  (Production is unaffected: NODE_ENV=production bypasses this guard.)",
      ""
    ].join("\n")
  );
  process.exit(2);
}

// CLI form: `node scripts/dev/db-guard.mjs "prisma migrate dev" && prisma migrate dev ...`
const invokedPath = process.argv[1] ?? "";
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const operation = process.argv[2] ?? "destructive database command";
  assertDestructiveDbAllowed(operation);
  console.log(`[db-guard] allowed: "${operation}"`);
}
