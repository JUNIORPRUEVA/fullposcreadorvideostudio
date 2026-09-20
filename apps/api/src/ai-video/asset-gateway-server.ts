import { createReadStream, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { getAiAssetToken, markAiAssetTokenUsed } from "./ai-asset-token-store.js";

export const AI_ASSET_GATEWAY_PORT = Number(process.env.AI_ASSET_GATEWAY_PORT ?? 4100);

export function createAiAssetGatewayServer() {
  return createServer((request, response) => {
    void handleRequest(request, response);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  try {
    if (request.method !== "GET") return sendEmpty(response, 404);
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/asset\/([a-f0-9]{64})$/);
    if (!match) return sendEmpty(response, 404);

    const record = await getAiAssetToken(match[1]);
    if (!record) return sendEmpty(response, 404);
    if (record.expired) return sendEmpty(response, 410);

    const stat = statSync(record.assetPath);
    response.statusCode = 200;
    response.setHeader("Content-Type", record.mimeType);
    response.setHeader("Content-Length", stat.size);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    await markAiAssetTokenUsed(record.token);
    createReadStream(record.assetPath).pipe(response);
  } catch {
    sendEmpty(response, 404);
  }
}

function sendEmpty(response: ServerResponse, statusCode: number) {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.end();
}

if (process.env.AI_ASSET_GATEWAY_START === "1" || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  const server = createAiAssetGatewayServer();
  server.listen(AI_ASSET_GATEWAY_PORT, "127.0.0.1", () => {
    process.stdout.write(`AI asset gateway listening on http://localhost:${AI_ASSET_GATEWAY_PORT}\n`);
  });
}
