import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("eager media download retirement", () => {
  it("keeps the retired Media Manager routes removed", () => {
    expect(existsSync("src/app/api/media/route.ts")).toBe(false);
    expect(existsSync("src/app/api/media/[filename]/route.ts")).toBe(false);
  });

  it("keeps navigation free of the retired Media Manager entry", () => {
    for (const filename of [
      "src/components/dashboard/sidebar-nav.tsx",
      "src/components/dashboard/mobile-nav.tsx",
    ]) {
      const source = readFileSync(filename, "utf8");
      expect(source).not.toContain("Media Manager");
      // The replacement Media Library uses the tenant-scoped v1 media API.
      expect(source).toContain('{ href: "/dashboard/media", label: "Pustaka Media"');
    }
  });

  it("uses the private media API for the Media Library page", () => {
    const page = readFileSync("src/app/dashboard/media/page.tsx", "utf8");
    const library = readFileSync("src/components/dashboard/media-library.tsx", "utf8");
    for (const source of [page, library]) {
      expect(source).not.toContain("data/media");
      expect(source).not.toContain("/api/media/[filename]");
    }
    expect(library).toContain("/api/v1/media");
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
