import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatBytes, MediaPicker, readMediaEnvelope } from "./media-picker";

describe("media picker helpers", () => {
  it("formats stored byte counts for compact metadata", () => {
    expect(formatBytes("1024")).toBe("1 KB");
    expect(formatBytes(String(2.5 * 1024 * 1024))).toBe("2.5 MB");
    expect(formatBytes("invalid")).toBeNull();
  });

  it("parses the API envelope", async () => {
    const response = new Response(JSON.stringify({ data: { id: "media-1" } }), {
      headers: { "content-type": "application/json" },
    });
    await expect(readMediaEnvelope<{ id: string }>(response)).resolves.toEqual({ data: { id: "media-1" } });
  });

  it("returns a useful error when a reverse proxy sends HTML", async () => {
    const response = new Response("<html>Bad gateway</html>", { status: 502 });
    await expect(readMediaEnvelope(response)).rejects.toThrow("Server menolak permintaan (502)");
  });

  it("renders an associated file input and a full-height keyboard action", () => {
    const markup = renderToStaticMarkup(createElement(MediaPicker, { value: "", onChange: () => undefined }));
    expect(markup).toContain("type=\"file\"");
    expect(markup).toContain("aria-label=\"Media (opsional)\"");
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("Pilih file");
  });
});
