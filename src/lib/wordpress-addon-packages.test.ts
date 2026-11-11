import { describe, expect, it } from "vitest";
import { GET as elementorDownload } from "@/app/api/public/plugin/elementor/route";
import { GET as wooDownload } from "@/app/api/public/plugin/woocommerce/route";
import {
  ELEMENTOR_PLUGIN_DIR,
  ELEMENTOR_ZIP_FILENAME,
  WOOCOMMERCE_PLUGIN_DIR,
  WOOCOMMERCE_ZIP_FILENAME,
  resolveElementorPluginZipBytes,
  resolveWooCommercePluginZipBytes,
} from "./wordpress-addon-packages";
import { looksLikeZip } from "./wordpress-plugin-zip";

function readZipEntries(buffer: Buffer) {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const size = buffer.readUInt32LE(offset + 18);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    entries.push({ name, data: buffer.subarray(dataStart, dataStart + size) });
    offset = dataStart + size;
  }
  return entries;
}

const packages: Array<{ label: string; root: string; resolve: () => Promise<Buffer> }> = [
  { label: "WooCommerce", root: WOOCOMMERCE_PLUGIN_DIR, resolve: resolveWooCommercePluginZipBytes },
  { label: "Elementor Form", root: ELEMENTOR_PLUGIN_DIR, resolve: resolveElementorPluginZipBytes },
];

describe("bundled WordPress add-on plugins", () => {
  for (const pkg of packages) {
    it(`packages the ${pkg.label} plugin without dev tests or secrets`, async () => {
      const zip = await pkg.resolve();
      expect(looksLikeZip(zip)).toBe(true);
      const entries = readZipEntries(zip);
      const names = entries.map((entry) => entry.name);
      expect(names).toContain(`${pkg.root}/${pkg.root}.php`);
      expect(names).toContain(`${pkg.root}/uninstall.php`);
      expect(names.some((name) => name.startsWith(`${pkg.root}/tests/`))).toBe(false);
      expect(entries.every((entry) => !/ppint_[A-Za-z0-9_-]{20,}/.test(entry.data.toString("utf8")))).toBe(true);
    });
  }

  it("serves both archives publicly with the right filenames", async () => {
    const woo = await wooDownload();
    expect(woo.status).toBe(200);
    expect(woo.headers.get("content-type")).toBe("application/zip");
    expect(woo.headers.get("content-disposition")).toBe(`attachment; filename="${WOOCOMMERCE_ZIP_FILENAME}"`);
    expect(looksLikeZip(Buffer.from(await woo.arrayBuffer()))).toBe(true);

    const elementor = await elementorDownload();
    expect(elementor.status).toBe(200);
    expect(elementor.headers.get("content-disposition")).toBe(`attachment; filename="${ELEMENTOR_ZIP_FILENAME}"`);
    expect(looksLikeZip(Buffer.from(await elementor.arrayBuffer()))).toBe(true);
  });
});
