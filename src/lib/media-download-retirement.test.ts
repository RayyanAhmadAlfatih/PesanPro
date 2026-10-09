import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("eager media download retirement", () => {
  it("removes the Media Manager page and its routes", () => {
    expect(existsSync("src/app/dashboard/media/page.tsx")).toBe(false);
    expect(existsSync("src/app/api/media/route.ts")).toBe(false);
    expect(existsSync("src/app/api/media/[filename]/route.ts")).toBe(false);
  });

  it("keeps navigation free of the retired Media Manager entry", () => {
    for (const filename of [
      "src/components/dashboard/sidebar-nav.tsx",
      "src/components/dashboard/mobile-nav.tsx",
    ]) {
      expect(readFileSync(filename, "utf8")).not.toContain("/dashboard/media");
    }
  });

  it("answers the legacy message-media download with 410 Gone", () => {
    const source = readFileSync(
      "src/app/api/messages/[sessionId]/download/[messageId]/media/route.ts",
      "utf8",
    );

    expect(source).toContain("status: 410");
    expect(source).toContain("MEDIA_DOWNLOAD_RETIRED");
  });

  it("no longer writes WhatsApp message media to data/media", () => {
    const source = readFileSync("src/lib/webhook.ts", "utf8");

    expect(source).not.toContain("downloadAndSaveMedia");
    expect(source).not.toContain('"data", "media"');
  });
});
