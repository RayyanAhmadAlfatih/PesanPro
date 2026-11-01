import { describe, expect, it } from "vitest";
import { isInternalGuideSlug, listGuides, readGuide } from "./docs";

describe("in-app documentation", () => {
  it("lists every public guide in order", async () => {
    const guides = await listGuides();
    expect(guides.length).toBeGreaterThanOrEqual(9);
    expect(guides[0].slug).toBe("01-memulai-umkm");
    expect(guides[0].title).toContain("Memulai");
  });

  it("hides internal operator guides from the public list", async () => {
    const publicGuides = await listGuides();
    expect(publicGuides.some((guide) => isInternalGuideSlug(guide.slug))).toBe(false);

    const allGuides = await listGuides({ includeInternal: true });
    expect(allGuides.some((guide) => isInternalGuideSlug(guide.slug))).toBe(true);
    expect(allGuides.length).toBeGreaterThan(publicGuides.length);
  });

  it("renders markdown and rewrites relative .md links to /docs", async () => {
    const guide = await readGuide("01-memulai-umkm");
    expect(guide).not.toBeNull();
    expect(guide?.html).toContain("<h1");
    expect(guide?.html).toContain('href="/docs/09-paket-dan-margin"');
  });

  it("keeps internal guides unreadable without the superadmin flag", async () => {
    const internalSlug = (await listGuides({ includeInternal: true })).find((guide) => isInternalGuideSlug(guide.slug))?.slug;
    expect(internalSlug).toBeDefined();
    expect(await readGuide(internalSlug!)).toBeNull();
    expect(await readGuide(internalSlug!, { includeInternal: true })).not.toBeNull();
  });

  it("rejects a slug that could escape the guides directory", async () => {
    expect(await readGuide("../package")).toBeNull();
    expect(await readGuide("01-memulai-umkm/../../package")).toBeNull();
  });
});
