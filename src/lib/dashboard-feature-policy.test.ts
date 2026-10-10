import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard feature policy", () => {
  it("keeps the notification Inbox available", () => {
    expect(existsSync("src/app/dashboard/inbox/page.tsx")).toBe(true);
    expect(readFileSync("src/components/dashboard/navbar.tsx", "utf8")).toContain("/dashboard/inbox");
  });

  it("removes the standalone WhatsApp Chat UI and endpoints", () => {
    expect(existsSync("src/app/dashboard/chat/page.tsx")).toBe(false);
    expect(existsSync("src/app/dashboard/chat/actions.ts")).toBe(false);
    expect(existsSync("src/app/api/chat/[sessionId]/route.ts")).toBe(false);

    for (const filename of [
      "src/components/dashboard/navbar.tsx",
      "src/components/dashboard/sidebar-nav.tsx",
      "src/components/dashboard/mobile-nav.tsx",
      "src/app/dashboard/page.tsx",
    ]) {
      expect(readFileSync(filename, "utf8")).not.toContain("/dashboard/chat");
    }
  });

  it("removes the Campaigns and Labels surfaces", () => {
    for (const path of [
      "src/app/dashboard/campaigns/page.tsx",
      "src/app/dashboard/labels/page.tsx",
      "src/app/api/v1/campaigns/route.ts",
      "src/app/api/v1/segments/route.ts",
      "src/app/api/labels/[sessionId]/route.ts",
    ]) {
      expect(existsSync(path), path).toBe(false);
    }

    for (const filename of [
      "src/components/dashboard/sidebar-nav.tsx",
      "src/components/dashboard/mobile-nav.tsx",
    ]) {
      const source = readFileSync(filename, "utf8");
      expect(source).not.toContain("/dashboard/campaigns");
      expect(source).not.toContain("/dashboard/labels");
    }
  });

  it("removes the Contacts and contact-tag API surfaces", () => {
    for (const path of [
      "src/app/api/v1/contacts/[id]/profile/route.ts",
      "src/app/api/v1/contact-tags/route.ts",
      "src/app/api/v1/contact-tags/[id]/route.ts",
    ]) {
      expect(existsSync(path), path).toBe(false);
    }
  });
});
