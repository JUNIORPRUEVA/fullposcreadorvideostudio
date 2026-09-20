import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { aiVideoRoot, uploadsRoot } from "../lib/paths.js";
import { aiVideoProfiles } from "./ai-video.profiles.js";
import { saveAiVideoBuffer } from "./ai-video-storage.js";
import { validateAiVideoRequest, validateCostConfirmation } from "./ai-video.validation.js";
import { resolveRunpodApiKey } from "./runpod-env.js";
import { buildRunpodInput, RunpodPublicVideoProvider } from "./runpod-public-video.provider.js";
import { createAiAssetGatewayServer } from "./asset-gateway-server.js";
import { createAiAssetToken } from "./ai-asset-token-store.js";
import { resolveR2Config } from "./r2-env.js";
import { R2_SIGNED_URL_TTL_SECONDS, validateR2Asset } from "./r2-signed-url-ai-asset-transport.js";

test("RunPod success response parses video URL and cost", () => {
  const result = RunpodPublicVideoProvider.parseRunpodResponse(
    { status: "COMPLETED", output: { video_url: "https://cdn.example.com/job.mp4", cost: "0.50" } },
    aiVideoProfiles.premium
  );
  assert.equal(result.videoUrl, "https://cdn.example.com/job.mp4");
  assert.equal(result.cost, 0.5);
  assert.equal(result.model, "wan-2-6-i2v");
});

test("RunPod failed response is rejected clearly", () => {
  assert.throws(
    () => RunpodPublicVideoProvider.parseRunpodResponse({ status: "FAILED", error: "bad image" }, aiVideoProfiles.preview),
    /bad image/
  );
});

test("RunPod queued response without video URL is not treated as provider failure", () => {
  const result = RunpodPublicVideoProvider.parseRunpodResponse({ id: "job-1", status: "IN_QUEUE" }, aiVideoProfiles.preview);
  assert.equal(result.status, "IN_QUEUE");
  assert.equal(result.runpodJobId, "job-1");
  assert.equal(result.videoUrl, undefined);
});

test("RunPod completed response without video URL remains invalid", () => {
  assert.throws(
    () => RunpodPublicVideoProvider.parseRunpodResponse({ id: "job-1", status: "COMPLETED", output: {} }, aiVideoProfiles.preview),
    /output.video_url/
  );
});

test("missing RunPod API key stays missing without fallback secrets", () => {
  assert.equal(resolveRunpodApiKey({ env: {}, envFileContent: "" }), undefined);
  assert.equal(resolveRunpodApiKey({ env: {}, envFileContent: "RUNPOD_API_KEY=\"abc123\"" }), "abc123");
});

test("invalid AI input duration is rejected", () => {
  assert.throws(
    () => validateAiVideoRequest({ scene: "desktop-hero", profile: "premium", duration: 6, motion: "elegant", prompt: "test" }),
    /5 segundos/
  );
});

test("cost guard requires explicit confirmation", () => {
  assert.throws(() => validateCostConfirmation(false), /Confirma el costo/);
});

test("RunPod provider sends official WAN 2.2 720p endpoint and input contract", async () => {
  let requestBody = "";
  let requestedUrl = "";
  const provider = RunpodPublicVideoProvider.withDependencies(
    async (url, init) => {
      requestedUrl = url;
      requestBody = String(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "COMPLETED", output: { video_url: "https://cdn.example.com/video.mp4", cost: 0.3 } }),
        text: async () => ""
      };
    },
    () => "test-key"
  );

  const result = await provider.generateImageToVideo({
    imageUrl: "https://cdn.example.com/input.png",
    prompt: "Clean SaaS motion",
    profile: aiVideoProfiles.preview,
    duration: 5,
    motion: "cinematic",
    seed: 12
  });
  const parsed = JSON.parse(requestBody) as { input: Record<string, unknown> };
  assert.equal(requestedUrl, "https://api.runpod.ai/v2/wan-2-2-i2v-720/runsync");
  assert.equal(requestedUrl.includes("/wan-2-2-i2v/runsync"), false);
  assert.deepEqual(Object.keys(parsed.input).sort(), ["duration", "enable_prompt_optimization", "enable_safety_checker", "flow_shift", "guidance", "image", "negative_prompt", "num_inference_steps", "prompt", "seed", "size"].sort());
  assert.equal(parsed.input.size, "1280*720");
  assert.equal(parsed.input.duration, 5);
  assert.equal(parsed.input.num_inference_steps, 30);
  assert.equal(parsed.input.guidance, 5);
  assert.equal(parsed.input.flow_shift, 5);
  assert.equal(parsed.input.seed, 12);
  assert.equal(parsed.input.enable_prompt_optimization, false);
  assert.equal(parsed.input.enable_safety_checker, true);
  assert.equal(result.videoUrl, "https://cdn.example.com/video.mp4");
  assert.equal(result.cost, 0.3);
});

test("WAN 2.2 configured preview cost and endpoint stay stable", () => {
  assert.equal(aiVideoProfiles.preview.estimatedCost, 0.3);
  assert.equal(aiVideoProfiles.preview.duration, 5);
  assert.equal(aiVideoProfiles.preview.endpoint.endsWith("/wan-2-2-i2v-720/runsync"), true);
  assert.equal(aiVideoProfiles.preview.endpoint.includes("/wan-2-2-i2v/runsync"), false);
});

test("RunPod provider maps 404 without retrying", async () => {
  const provider = RunpodPublicVideoProvider.withDependencies(
    async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "not found" }),
    () => "test-key"
  );
  await assert.rejects(
    () => provider.generateImageToVideo({ imageUrl: "https://cdn.example.com/input.png", prompt: "test", profile: aiVideoProfiles.preview, duration: 5, motion: "elegant" }),
    /404/
  );
});

test("buildRunpodInput keeps WAN 2.2 official fields stable", () => {
  const input = buildRunpodInput({ imageUrl: "https://example.com/in.png", prompt: "p", profile: aiVideoProfiles.preview, duration: 5, motion: "elegant" });
  assert.equal(input.size, "1280*720");
  assert.equal(input.seed, -1);
  assert.equal("shot_type" in input, false);
  assert.equal("enable_prompt_expansion" in input, false);
});

test("downloaded AI video storage path is local and predictable", async () => {
  const projectId = "test-project";
  const jobId = `job-${Date.now()}`;
  const outputPath = await saveAiVideoBuffer(projectId, jobId, Buffer.from("mp4"));
  assert.equal(outputPath, path.join(aiVideoRoot, projectId, `${jobId}.mp4`));
  assert.equal(existsSync(outputPath), true);
  rmSync(path.join(aiVideoRoot, projectId), { recursive: true, force: true });
});

test("AI asset gateway serves only tokenized image bytes", async () => {
  const projectId = "test-ai-assets";
  const uploadDir = path.join(uploadsRoot, projectId);
  mkdirSync(uploadDir, { recursive: true });
  const imagePath = path.join(uploadDir, "billing.png");
  writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));

  const token = await createAiAssetToken({ assetPath: imagePath, mimeType: "image/png" });
  const server = createAiAssetGatewayServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  const baseUrl = `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;

  const valid = await fetch(`${baseUrl}/asset/${token.token}`);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("content-type"), "image/png");
  assert.equal(Number(valid.headers.get("content-length")), 6);
  assert.equal((await valid.arrayBuffer()).byteLength, 6);

  const invalid = await fetch(`${baseUrl}/asset/${"1".repeat(64)}`);
  assert.equal(invalid.status, 404);

  const traversal = await fetch(`${baseUrl}/asset/..%2f..%2f.env`);
  assert.equal(traversal.status, 404);

  server.close();
  rmSync(uploadDir, { recursive: true, force: true });
});

test("AI asset gateway rejects expired tokens", async () => {
  const projectId = "test-ai-assets-expired";
  const uploadDir = path.join(uploadsRoot, projectId);
  mkdirSync(uploadDir, { recursive: true });
  const imagePath = path.join(uploadDir, "mobile.webp");
  writeFileSync(imagePath, Buffer.from([1, 2, 3]));

  const token = await createAiAssetToken({ assetPath: imagePath, mimeType: "image/webp", ttlMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const server = createAiAssetGatewayServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;

  const expired = await fetch(`${baseUrl}/asset/${token.token}`);
  assert.equal(expired.status, 410);

  server.close();
  rmSync(uploadDir, { recursive: true, force: true });
});

test("missing R2 env does not create a partial config", () => {
  assert.equal(resolveR2Config({ env: {}, envFileContent: "" }), undefined);
  assert.equal(resolveR2Config({ env: { R2_BUCKET_NAME: "bucket" }, envFileContent: "" }), undefined);
});

test("R2 env resolves only from names without exposing values", () => {
  const config = resolveR2Config({
    env: {},
    envFileContent: [
      "R2_ACCOUNT_ID=account",
      "R2_ACCESS_KEY_ID=access",
      "R2_SECRET_ACCESS_KEY=secret",
      "R2_BUCKET_NAME=bucket",
      "R2_ENDPOINT=https://account.r2.cloudflarestorage.com"
    ].join("\n")
  });
  assert.equal(config?.bucketName, "bucket");
  assert.equal(R2_SIGNED_URL_TTL_SECONDS, 600);
});

test("R2 asset validation rejects unsafe local paths and invalid types", () => {
  assert.throws(() => validateR2Asset(path.join(process.cwd(), "package.json"), "application/json"), /Unsafe path|Unsupported/);

  const uploadDir = path.join(uploadsRoot, "test-r2-validation");
  mkdirSync(uploadDir, { recursive: true });
  const svgPath = path.join(uploadDir, "bad.svg");
  writeFileSync(svgPath, "<svg />");
  assert.throws(() => validateR2Asset(svgPath, "image/svg+xml"), /Unsupported/);
  rmSync(uploadDir, { recursive: true, force: true });
});
