import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const pidFile = path.join(process.cwd(), "storage", "temp", "logs", "local-servers.pids.json");

if (!existsSync(pidFile)) {
  console.log("No managed local server PID file found.");
  process.exit(0);
}

const servers = JSON.parse(readFileSync(pidFile, "utf8"));
for (const server of servers) {
  try {
    execFileSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    console.log(`Stopped ${server.name} pid ${server.pid}`);
  } catch {
    console.log(`${server.name} pid ${server.pid} was not running`);
  }
}
