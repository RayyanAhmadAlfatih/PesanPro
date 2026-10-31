import { describe, expect, it } from "vitest";
import { listGuides, readGuide } from "./docs";

describe("in-app documentation", () => {
  it("lists every guide in order", async () => {
    const guides = await listGuides();
    expect(guides.length).toBeGreaterThanOrEqual(10);
    expect(guides[0].slug).toBe("01-memulai-umkm");
    expect(guides[0].title).toContain("Memulai");
  });

  it("renders markdown and rewrites relative .md links to /docs", async () => {
    const guide = await readGuide("01-memulai-umkm");
    expect(guide).not.toBeNull();
    expect(guide?.html).toContain("<h1");
    expect(guide?.html).toContain('href="/docs/09-paket-dan-margin"');
  });

  it("rejects a slug that could escape the guides directory", async () => {
    expect(await readGuide("../package")).toBeNull();
    expect(await readGuide("01-memulai-umkm/../../package")).toBeNull();
  });
});
