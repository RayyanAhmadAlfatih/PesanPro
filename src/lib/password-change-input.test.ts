import { describe, expect, it } from "vitest";
import { passwordChangeSchema } from "./password-change-input";

describe("password change input", () => {
  it("accepts a valid current and new password", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "password-lama",
      newPassword: "password-baru-2026",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a new password shorter than 8 characters", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "password-lama",
      newPassword: "pendek",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty current password", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "",
      newPassword: "password-baru-2026",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown extra fields", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "password-lama",
      newPassword: "password-baru-2026",
      username: "bukan-bagian-skema",
    });
    expect(parsed.success).toBe(false);
  });
});
