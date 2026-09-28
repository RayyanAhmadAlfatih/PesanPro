import { describe, expect, it } from "vitest";
import {
  DEFAULT_FAVICON_URL,
  normalizeAppName,
  normalizeBrandAssetUrl,
} from "./brand-config";

describe("runtime brand configuration", () => {
  it("keeps safe local and HTTPS brand assets", () => {
    expect(normalizeBrandAssetUrl("/brand/logo.webp")).toBe("/brand/logo.webp");
    expect(normalizeBrandAssetUrl("https://cdn.example.com/logo.webp")).toBe("https://cdn.example.com/logo.webp");
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "http://cdn.example.com/logo.webp",
    "//evil.example/logo.webp",
    "/\\evil.example/logo.webp",
    "/logo.webp\r\nX-Test: bad",
  ])("rejects unsafe brand asset URL %s", (value) => {
    expect(normalizeBrandAssetUrl(value, DEFAULT_FAVICON_URL)).toBe(DEFAULT_FAVICON_URL);
  });

  it("normalizes application names without changing a valid name", () => {
    expect(normalizeAppName("  PesanPro Business  ")).toBe("PesanPro Business");
    expect(normalizeAppName("")).toBe("PesanPro");
  });
});
