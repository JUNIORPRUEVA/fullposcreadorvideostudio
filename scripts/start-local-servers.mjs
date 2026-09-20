import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const logsDir = path.join(root, "storage", "temp", "logs");
mkdirSync(logsDir, { recursive: true });

const servers = [
  {
    name: "backend",
    workspace: "@fullpos-ad-studio/api",
    url: "http://localhost:4000/projects"
  },
  {
    name: "frontend",
    workspace: "@fullpos-ad-studio/web",
    url: "http://localhost:3000"
  }
];

const pidFile = path.join(logsDir, "local-servers.pids.json");
const started = [];

for (const server of servers) {
  const out = path.join(logsDir, `${server.name}.out.log`);
  const err = path.join(logsDir, `${server.name}.err.log`);
  const ps = [
    "$p = Start-Process",
    "-FilePath 'npm.cmd'",
    `-ArgumentList @('run','dev','--workspace','${server.workspace}')`,
    `-WorkingDirectory '${root.replaceAll("'", "''")}'`,
    `-RedirectStandardOutput '${out.replaceAll("'", "''")}'`,
    `-RedirectStandardError '${err.replaceAll("'", "''")}'`,
    "-WindowStyle Hidden",
    "-PassThru;",
    "$p.Id"
  ].join(" ");
  const pid = Number(execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
  started.push({ ...server, pid });
}

writeFileSync(pidFile, JSON.stringify(started, null, 2));

for (const server of started) {
  await waitForHealth(server);
}

console.log(JSON.stringify({ logsDir, pidFile, servers: started }, null, 2));

async function waitForHealth(server) {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const status = execFileSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `(Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 '${server.url}').StatusCode`
      ], { encoding: "utf8", timeout: 8000 }).trim();
      if (status === "200") return;
      lastError = `HTTP ${status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`${server.name} failed health check ${server.url}: ${lastError}\n${tailLog(server.name)}`);
}

function tailLog(name) {
  const files = [`${name}.out.log`, `${name}.err.log`].map((file) => path.join(logsDir, file));
  return files
    .filter((file) => existsSync(file))
    .map((file) => `--- ${path.basename(file)} ---\n${readFileSync(file, "utf8").slice(-4000)}`)
    .join("\n");
}
