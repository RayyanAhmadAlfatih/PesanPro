import { describe, expect, it } from "vitest";
import {
  generatePasswordResetSecret,
  hashPasswordResetSecret,
  passwordSchema,
} from "./password-policy";

describe("password policy", () => {
  it("requires a long mixed-case password with a number", () => {
    expect(passwordSchema.safeParse("StrongPass123").success).toBe(true);
    expect(passwordSchema.safeParse("short1A").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase123").success).toBe(false);
    expect(passwordSchema.safeParse("NOLOWERCASE123").success).toBe(false);
    expect(passwordSchema.safeParse("NoNumbersHere").success).toBe(false);
  });

  it("creates unpredictable reset secrets and stores only deterministic hashes", () => {
    const first = generatePasswordResetSecret();
    const second = generatePasswordResetSecret();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashPasswordResetSecret(first)).toHaveLength(64);
    expect(hashPasswordResetSecret(first)).not.toContain(first);
    expect(hashPasswordResetSecret(first)).toBe(hashPasswordResetSecret(first));
  });
});
