import test from "node:test";
import assert from "node:assert/strict";
import { ProjectsService } from "./projects.service.js";

function createServiceMock(options: { assetExists?: boolean } = {}) {
  const calls: {
    createdScene?: Record<string, unknown>;
    updatedScene?: Record<string, unknown>;
    assetLookup?: Record<string, unknown>;
  } = {};
  const project = {
    id: "project-a",
    assets: [{ id: "asset-a", type: "image", durationSeconds: null }],
    scenes: [],
    renderJobs: [],
    aiVideoJobs: [],
    brandProfile: null
  };
  const prisma = {
    project: {
      findUnique: async () => project
    },
    asset: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.assetLookup = args;
        return options.assetExists === false ? null : { id: "asset-a" };
      }
    },
    videoScene: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.createdScene = args.data;
        return { id: "scene-a", ...args.data };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        calls.updatedScene = args.data;
        return { id: "scene-a", ...args.data };
      }
    }
  };
  const service = new ProjectsService(prisma as never, {} as never);
  return { calls, service };
}

test("createScene persists the definitive media asset id", async () => {
  const { calls, service } = createServiceMock();

  const scene = await service.createScene("project-a", {
    title: "Intro",
    order: 1,
    mediaAssetId: "asset-a"
  });

  assert.equal(scene.mediaAssetId, "asset-a");
  assert.equal(calls.createdScene?.mediaAssetId, "asset-a");
  assert.deepEqual(calls.assetLookup, { where: { id: "asset-a", projectId: "project-a" }, select: { id: true } });
});

test("createScene rejects media ids that do not belong to the project", async () => {
  const { service } = createServiceMock({ assetExists: false });

  await assert.rejects(
    () => service.createScene("project-a", { title: "Intro", order: 1, mediaAssetId: "missing-asset" }),
    /Selected media does not exist/
  );
});

test("updateScene can explicitly clear media without preserving a stale id", async () => {
  const { calls, service } = createServiceMock();

  const scene = await service.updateScene("project-a", "scene-a", { mediaAssetId: null });

  assert.equal(scene.mediaAssetId, null);
  assert.equal(calls.updatedScene?.mediaAssetId, null);
  assert.equal(calls.assetLookup, undefined);
});
