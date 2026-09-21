import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { BrandsService } from "./brands.service.js";

const baseBrand = {
  id: "brand-a",
  name: "Brand A",
  slug: "brand-a",
  archived: false,
  isDefault: false,
  projects: [],
  assets: []
};

function serviceWith(prisma: Record<string, unknown>) {
  return new BrandsService(prisma as never, {} as never);
}

test("Brand with zero projects can be safely deleted", async () => {
  const calls: string[] = [];
  const service = serviceWith({
    brandProfile: {
      findUnique: async () => ({ ...baseBrand }),
      delete: async () => {
        calls.push("brand.delete");
        return { ...baseBrand };
      }
    },
    brandAsset: {
      deleteMany: async () => {
        calls.push("asset.deleteMany");
        return { count: 0 };
      }
    }
  });

  await service.remove("brand-a");
  assert.deepEqual(calls, ["asset.deleteMany", "brand.delete"]);
});

test("Brand with existing project blocks hard delete", async () => {
  const service = serviceWith({
    brandProfile: {
      findUnique: async () => ({ ...baseBrand, projects: [{ id: "project-a", name: "Project A", videoType: "COURSE" }] })
    }
  });

  await assert.rejects(() => service.remove("brand-a"), BadRequestException);
});

test("Archive preserves projects and marks brand archived", async () => {
  let updateArgs: unknown;
  const service = serviceWith({
    brandProfile: {
      findUnique: async () => ({ ...baseBrand, projects: [{ id: "project-a", name: "Project A", videoType: "COURSE" }] }),
      update: async (args: unknown) => {
        updateArgs = args;
        return { ...baseBrand, archived: true };
      }
    }
  });

  await service.archive("brand-a");
  assert.deepEqual(updateArgs, { where: { id: "brand-a" }, data: { archived: true, isDefault: false }, include: { assets: true, projects: { select: { id: true, name: true, videoType: true } } } });
});

test("Reassign and delete moves projects before deleting source brand", async () => {
  const calls: string[] = [];
  const service = serviceWith({
    brandProfile: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === "brand-a"
        ? { ...baseBrand, projects: [{ id: "project-a", name: "Project A", videoType: "COURSE" }] }
        : { ...baseBrand, id: "brand-b", slug: "brand-b", name: "Brand B" },
      delete: async () => {
        calls.push("brand.delete");
        return { ...baseBrand };
      }
    },
    project: {
      updateMany: async () => {
        calls.push("project.updateMany");
        return { count: 1 };
      }
    },
    brandAsset: {
      deleteMany: async () => {
        calls.push("asset.deleteMany");
        return { count: 0 };
      }
    }
  });

  await service.reassignAndDelete("brand-a", { targetBrandId: "brand-b" });
  assert.deepEqual(calls, ["project.updateMany", "asset.deleteMany", "brand.delete"]);
});

test("Default brand cannot be deleted directly", async () => {
  const service = serviceWith({
    brandProfile: {
      findUnique: async () => ({ ...baseBrand, isDefault: true })
    }
  });

  await assert.rejects(() => service.remove("brand-a"), BadRequestException);
});
