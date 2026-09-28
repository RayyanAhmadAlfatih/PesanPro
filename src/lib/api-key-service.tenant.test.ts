import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    apiKey: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  },
}));

import { listApiKeys, revokeApiKey } from "./api-key-service";

describe("roadmap L2 API key tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
  });

  it("[L2-19] lists keys only for the authenticated tenant owner", async () => {
    await listApiKeys("user-a");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-a" },
    }));
  });

  it("[L2-19][L2-20][L2-21] scopes revoke by both key id and owner", async () => {
    await expect(revokeApiKey("user-a", "key-b")).resolves.toBe(false);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "key-b", userId: "user-a", revokedAt: null },
    }));
  });
});
