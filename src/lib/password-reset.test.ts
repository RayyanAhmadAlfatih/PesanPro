import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: {
    id: "reset-1",
    userId: "user-a",
    usedAt: null as Date | null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  },
  userUpdate: vi.fn(),
  tokenDeleteMany: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "new-hash") } }));
vi.mock("./logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      passwordResetToken: {
        findUnique: vi.fn(async () => ({ ...state.token })),
        updateMany: vi.fn(async () => {
          if (state.token.usedAt) return { count: 0 };
          state.token.usedAt = new Date();
          return { count: 1 };
        }),
        deleteMany: state.tokenDeleteMany,
      },
      user: { update: state.userUpdate },
    })),
    user: { findUnique: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() },
  },
}));

import { consumePasswordReset } from "./password-reset";

describe("roadmap L1 password reset durability", () => {
  beforeEach(() => {
    state.token.usedAt = null;
    state.token.expiresAt = new Date("2099-01-01T00:00:00.000Z");
    state.userUpdate.mockReset();
    state.tokenDeleteMany.mockReset();
  });

  it("[L1-18][L1-19] consumes a valid token exactly once", async () => {
    const secret = "a".repeat(48);
    await expect(consumePasswordReset(secret, "StrongPass123")).resolves.toMatchObject({
      success: true,
      userId: "user-a",
    });
    await expect(consumePasswordReset(secret, "StrongPass123")).resolves.toEqual({ success: false });
    expect(state.userUpdate).toHaveBeenCalledTimes(1);
    expect(state.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-a" },
      data: expect.objectContaining({
        password: "new-hash",
        sessionVersion: { increment: 1 },
      }),
    }));
  });

  it("[L1-20] rejects an expired reset token without updating the user", async () => {
    state.token.expiresAt = new Date("2000-01-01T00:00:00.000Z");
    await expect(consumePasswordReset("b".repeat(48), "StrongPass123")).resolves.toEqual({ success: false });
    expect(state.userUpdate).not.toHaveBeenCalled();
  });
});
