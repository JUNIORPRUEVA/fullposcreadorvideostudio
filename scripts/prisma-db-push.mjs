import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertDestructiveDbAllowed } from "./dev/db-guard.mjs";

assertDestructiveDbAllowed("npm run db:push (prisma db push)");

const root = process.cwd();
const schema = path.join(root, "apps", "api", "prisma", "schema.prisma");
const dbPath = path.join(root, "apps", "api", "prisma", "dev.db").replaceAll("\\", "/");

const env = {
  ...process.env,
  DATABASE_URL: `file:${dbPath}`,
  // Prisma 6.19.3 schema-engine on this Windows/Node 24 host exits with a blank
  // "Schema engine error" for SQLite db push unless Rust logging is initialized.
  RUST_LOG: process.env.RUST_LOG ?? "info"
};

const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "prisma", "build", "index.js"), "db", "push", "--schema", schema, "--skip-generate"],
  {
    cwd: root,
    env,
    stdio: "inherit"
  }
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
