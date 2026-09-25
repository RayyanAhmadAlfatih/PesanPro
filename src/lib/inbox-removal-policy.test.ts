import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("retired notification inbox", () => {
  it("removes the standalone inbox route", () => {
    expect(existsSync("src/app/dashboard/inbox/page.tsx")).toBe(false);
  });

  it("does not link the notification popover to the retired route", () => {
    const navbar = readFileSync("src/components/dashboard/navbar.tsx", "utf8");
    expect(navbar).not.toContain("/dashboard/inbox");
  });
});
