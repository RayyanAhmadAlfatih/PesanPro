import { describe, expect, it } from "vitest";
import { announcementSchema } from "./announcement-input";

const baseDraft = {
  title: "Antrian pesan bisa dikirim ulang",
  body: "Pesan yang gagal bisa dikirim ulang dari halaman Antrian Pesan.\nStatus kegagalan sekarang memakai kode yang bisa dicari.",
  publish: false,
};

describe("announcement input", () => {
  it("accepts a draft with a few bullets", () => {
    const parsed = announcementSchema.safeParse(baseDraft);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.publish).toBe(false);
      expect(parsed.data.href).toBeUndefined();
    }
  });

  it("defaults publish to false so nothing goes live by accident", () => {
    const parsed = announcementSchema.safeParse({ title: baseDraft.title, body: baseDraft.body });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.publish).toBe(false);
  });

  it("rejects more bullets than the popup can show", () => {
    const parsed = announcementSchema.safeParse({
      ...baseDraft,
      body: "Satu\nDua\nTiga\nEmpat\nLima",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "body")).toBe(true);
    }
  });

  it("rejects a body that is only blank lines", () => {
    expect(announcementSchema.safeParse({ ...baseDraft, body: "\n   \n" }).success).toBe(false);
  });

  it("rejects an off-site link that would turn the popup into an open redirect", () => {
    expect(announcementSchema.safeParse({ ...baseDraft, href: "https://example.com" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...baseDraft, href: "//example.com" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...baseDraft, href: "/dashboard/settings" }).success).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(announcementSchema.safeParse({ ...baseDraft, status: "PUBLISHED" }).success).toBe(false);
  });

  it("rejects a title that is too short to describe anything", () => {
    expect(announcementSchema.safeParse({ ...baseDraft, title: "Hi" }).success).toBe(false);
  });
});
