import { describe, expect, it } from "vitest";
import {
  PLUGIN_ZIP_ROOT_DIR,
  buildPluginZip,
  collectBundledPluginFiles,
  looksLikeZip,
  resolvePluginZipBytes,
} from "./wordpress-plugin-zip";

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

describe("wordpress plugin zip", () => {
  it("builds a readable archive with the original file contents", () => {
    const zip = buildPluginZip([
      { name: `${PLUGIN_ZIP_ROOT_DIR}/pesanpro-contact-form-7.php`, data: Buffer.from("<?php // main\n", "utf8") },
      { name: `${PLUGIN_ZIP_ROOT_DIR}/readme.txt`, data: Buffer.from("PesanPro CF7\n", "utf8") },
    ]);

    expect(looksLikeZip(zip)).toBe(true);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);

    const entries = readZipEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual([
      `${PLUGIN_ZIP_ROOT_DIR}/pesanpro-contact-form-7.php`,
      `${PLUGIN_ZIP_ROOT_DIR}/readme.txt`,
    ]);
    expect(entries[0].data.toString("utf8")).toBe("<?php // main\n");
    expect(entries[1].data.toString("utf8")).toBe("PesanPro CF7\n");
  });

  it("collects the bundled plugin sources without dev tests", async () => {
    const files = await collectBundledPluginFiles();
    const names = files.map((file) => file.name);
    expect(names).toContain(`${PLUGIN_ZIP_ROOT_DIR}/pesanpro-contact-form-7.php`);
    expect(names).toContain(`${PLUGIN_ZIP_ROOT_DIR}/includes/class-pesanpro-cf7-form-message.php`);
    expect(names.some((name) => name.startsWith(`${PLUGIN_ZIP_ROOT_DIR}/tests/`))).toBe(false);
  });

  it("serves a zip without requiring a custom upload", async () => {
    const zip = await resolvePluginZipBytes();
    expect(looksLikeZip(zip)).toBe(true);
    const names = readZipEntries(zip).map((entry) => entry.name);
    expect(names).toContain(`${PLUGIN_ZIP_ROOT_DIR}/pesanpro-contact-form-7.php`);
  });
});
