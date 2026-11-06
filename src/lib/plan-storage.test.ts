import { describe, expect, it } from "vitest";
import { formatPlanStorage } from "./plan-storage";

/**
 * Byte values come from
 * prisma/migrations/20261031000000_premium_plans_and_upload_limits/migration.sql
 * (MEDIA_STORAGE_BYTES rows for plan_starter / plan_bisnis / plan_pro) and must
 * match the "1 GB / 5 GB / 20 GB" table in docs/panduan/04-media-dan-limit-upload.md.
 */
describe("plan storage label on the sign-up cards", () => {
  it("renders the three published plan limits", () => {
    expect(formatPlanStorage("1073741824")).toBe("1 GB");
    expect(formatPlanStorage("5368709120")).toBe("5 GB");
    expect(formatPlanStorage("21474836480")).toBe("20 GB");
  });

  it("keeps sub-gigabyte values in MB", () => {
    expect(formatPlanStorage("524288000")).toBe("500 MB");
  });

  it("hides missing, zero, and invalid values instead of inventing a limit", () => {
    expect(formatPlanStorage(null)).toBeNull();
    expect(formatPlanStorage(undefined)).toBeNull();
    expect(formatPlanStorage("0")).toBeNull();
    expect(formatPlanStorage("bukan-angka")).toBeNull();
  });
});
