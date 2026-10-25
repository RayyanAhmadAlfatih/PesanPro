import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./safe-redirect";

describe("safeInternalRedirect", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeInternalRedirect("/dashboard/campaigns?tab=active#latest")).toBe("/dashboard/campaigns?tab=active#latest");
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example/phish",
    "\\\\evil.example\\phish",
    "javascript:alert(1)",
    "  https://evil.example  ",
  ])("rejects external or ambiguous callback %s", (value) => {
    expect(safeInternalRedirect(value)).toBe("/dashboard");
  });

  it("uses the supplied fallback for missing values", () => {
    expect(safeInternalRedirect(null, "/auth/login")).toBe("/auth/login");
  });
});
