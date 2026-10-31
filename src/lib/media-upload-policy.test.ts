import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntitlementDeniedError } from "./billing";
import { getMediaUploadPolicy } from "./media-upload-policy";

const mocks = vi.hoisted(() => ({ requireEntitlement: vi.fn() }));

vi.mock("./billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing")>();
  return { ...actual, requireEntitlement: mocks.requireEntitlement };
});

vi.mock("./env", () => ({
  getEnv: () => ({ MAX_UPLOAD_SIZE_MB: 100 }),
}));

function entitlement(limit: bigint | null) {
  return { feature: "MEDIA_MAX_UPLOAD_BYTES" as const, enabled: true, limit, source: "PLAN" as const };
}

describe("media upload policy", () => {
  beforeEach(() => {
    mocks.requireEntitlement.mockReset();
  });

  it("uses the plan ceiling when it is below the platform ceiling", async () => {
    mocks.requireEntitlement.mockResolvedValue(entitlement(BigInt(25 * 1024 * 1024)));
    await expect(getMediaUploadPolicy("user-1")).resolves.toEqual({
      maxUploadBytes: 25 * 1024 * 1024,
      planLimitBytes: 25 * 1024 * 1024,
      platformLimitBytes: 100 * 1024 * 1024,
    });
  });

  it("falls back to the platform ceiling when the plan is unlimited", async () => {
    mocks.requireEntitlement.mockResolvedValue(entitlement(null));
    await expect(getMediaUploadPolicy("user-1")).resolves.toEqual({
      maxUploadBytes: 100 * 1024 * 1024,
      planLimitBytes: null,
      platformLimitBytes: 100 * 1024 * 1024,
    });
  });

  it("never lets a plan exceed the platform ceiling", async () => {
    mocks.requireEntitlement.mockResolvedValue(entitlement(BigInt(500 * 1024 * 1024)));
    await expect(getMediaUploadPolicy("user-1")).resolves.toMatchObject({
      maxUploadBytes: 100 * 1024 * 1024,
      planLimitBytes: 500 * 1024 * 1024,
    });
  });

  it("keeps a zero limit at zero instead of treating it as unlimited", async () => {
    mocks.requireEntitlement.mockResolvedValue(entitlement(BigInt(0)));
    await expect(getMediaUploadPolicy("user-1")).resolves.toMatchObject({ maxUploadBytes: 0 });
  });

  it("propagates a denied entitlement so an unpaid tenant cannot upload", async () => {
    mocks.requireEntitlement.mockRejectedValue(new EntitlementDeniedError("MEDIA_MAX_UPLOAD_BYTES"));
    await expect(getMediaUploadPolicy("user-1")).rejects.toBeInstanceOf(EntitlementDeniedError);
  });
});
