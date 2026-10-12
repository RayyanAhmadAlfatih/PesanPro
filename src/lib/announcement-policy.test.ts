import { describe, expect, it } from "vitest";
import {
  isInternalAnnouncementHref,
  normalizeAnnouncementBody,
  parseAnnouncementLines,
  shouldShowAnnouncement,
} from "./announcement-policy";

describe("announcement policy", () => {
  it("reads one bullet per line and drops markdown markers", () => {
    expect(
      parseAnnouncementLines("- Kirim ulang antrian yang gagal\n* Filter per status\n• Unduh log"),
    ).toEqual(["Kirim ulang antrian yang gagal", "Filter per status", "Unduh log"]);
  });

  it("drops blank lines and trims surrounding whitespace", () => {
    expect(parseAnnouncementLines("\n  Baris pertama  \n\n   \nBaris kedua\n")).toEqual([
      "Baris pertama",
      "Baris kedua",
    ]);
  });

  it("normalizes a body into the stored one-bullet-per-line shape", () => {
    expect(normalizeAnnouncementBody("- Satu\n\n- Dua\n")).toBe("Satu\nDua");
    expect(normalizeAnnouncementBody("   \n\n ")).toBe("");
  });

  it("keeps a hyphen that is part of the sentence", () => {
    expect(parseAnnouncementLines("Kode e-wallet dan e-commerce")).toEqual([
      "Kode e-wallet dan e-commerce",
    ]);
  });

  it("accepts only in-app links so the popup cannot become an open redirect", () => {
    expect(isInternalAnnouncementHref("/dashboard/settings")).toBe(true);
    expect(isInternalAnnouncementHref("  /dashboard/billing  ")).toBe(true);
    expect(isInternalAnnouncementHref("https://example.com")).toBe(false);
    expect(isInternalAnnouncementHref("//example.com/dashboard")).toBe(false);
    expect(isInternalAnnouncementHref("javascript:alert(1)")).toBe(false);
    expect(isInternalAnnouncementHref("dashboard/settings")).toBe(false);
  });

  it("shows an announcement only when it is newer than the dismissed one", () => {
    const published = new Date("2026-10-12T08:00:00.000Z");
    const earlier = new Date("2026-10-10T08:00:00.000Z");
    const later = new Date("2026-10-13T08:00:00.000Z");

    expect(shouldShowAnnouncement(published, null)).toBe(true);
    expect(shouldShowAnnouncement(published, earlier)).toBe(true);
    expect(shouldShowAnnouncement(published, later)).toBe(false);
    expect(shouldShowAnnouncement(published, published)).toBe(false);
  });

  it("never shows an unpublished announcement", () => {
    expect(shouldShowAnnouncement(null, null)).toBe(false);
    expect(shouldShowAnnouncement(null, new Date("2020-01-01T00:00:00.000Z"))).toBe(false);
  });
});
