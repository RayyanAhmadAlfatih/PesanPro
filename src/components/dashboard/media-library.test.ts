import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMediaBytes, MediaLibrary, sumMediaBytes } from "./media-library";

describe("media library helpers", () => {
  it("formats file sizes for the list", () => {
    expect(formatMediaBytes("0")).toBe("0 B");
    expect(formatMediaBytes(2048)).toBe("2 KB");
    expect(formatMediaBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("sums the sizes of the media that are actually listed", () => {
    expect(sumMediaBytes([{ sizeBytes: "1024" }, { sizeBytes: "2048" }])).toBe(BigInt(3072));
    expect(sumMediaBytes([{ sizeBytes: "invalid" }])).toBe(BigInt(0));
  });

  it("renders the loading state with keyboard-operable upload controls and the plan ceiling", () => {
    const markup = renderToStaticMarkup(createElement(MediaLibrary, { storageLimitBytes: 1024 ** 3 }));
    expect(markup).toContain("Memuat media...");
    expect(markup).toContain('type="file"');
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("1 GB");
  });
});
