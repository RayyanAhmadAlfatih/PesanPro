import { readFile, readdir, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import path from "node:path";

export const PLUGIN_ZIP_FILENAME = "pesanpro-contact-form-7.zip";
export const PLUGIN_ZIP_ROOT_DIR = "pesanpro-contact-form-7";
export const PLUGIN_ZIP_MAX_BYTES = 10 * 1024 * 1024;

const BUNDLED_PLUGIN_DIR = path.join(process.cwd(), "integrations", "wordpress", PLUGIN_ZIP_ROOT_DIR);
const CUSTOM_ZIP_PATH = path.join(process.cwd(), "data", "downloads", PLUGIN_ZIP_FILENAME);

export type PluginZipEntry = { name: string; data: Buffer };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  // DOS timestamps have 2-second granularity and start in 1980. A fixed epoch
  // keeps the archive byte-identical for the same source files.
  const year = Math.max(1980, date.getUTCFullYear());
  const month = Math.max(1, Math.min(12, date.getUTCMonth() + 1));
  const day = Math.max(1, Math.min(31, date.getUTCDate()));
  const hours = Math.max(0, Math.min(23, date.getUTCHours()));
  const minutes = Math.max(0, Math.min(59, date.getUTCMinutes()));
  const seconds = Math.floor(Math.max(0, Math.min(59, date.getUTCSeconds())) / 2);
  const time = (hours << 11) | (minutes << 5) | seconds;
  const dos = ((year - 1980) << 9) | (month << 5) | day;
  return { time, date: dos };
}

/**
 * Build a ZIP archive with stored (uncompressed) entries.
 *
 * The plugin sources are tens of kilobytes, so compression is not worth a
 * dependency; every ZIP reader understands method 0.
 */
export function buildPluginZip(entries: readonly PluginZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now);
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 file names.
    local.writeUInt16LE(0, 8); // Stored.
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name);

    offset += local.length + name.length + size;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, end]);
}

export function looksLikeZip(buffer: Buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

async function collectFiles(dir: string, prefix: string, skip: Set<string>): Promise<PluginZipEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: PluginZipEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      files.push(...await collectFiles(absolute, name, skip));
    } else {
      files.push({ name, data: await readFile(absolute) });
    }
  }
  return files;
}

/**
 * The plugin sources bundled with the repository. Dev tests stay out of the
 * distributable; WordPress plugin directories do not ship them.
 */
export async function collectBundledPluginFiles(): Promise<PluginZipEntry[]> {
  const files = await collectFiles(BUNDLED_PLUGIN_DIR, PLUGIN_ZIP_ROOT_DIR, new Set(["tests"]));
  if (!files.some((file) => file.name === `${PLUGIN_ZIP_ROOT_DIR}/${PLUGIN_ZIP_ROOT_DIR}.php`)) {
    throw new Error("Bundled WordPress plugin sources are missing the main plugin file");
  }
  return files;
}

export async function readCustomPluginZip(): Promise<Buffer | null> {
  try {
    return await readFile(CUSTOM_ZIP_PATH);
  } catch {
    return null;
  }
}

export async function saveCustomPluginZip(buffer: Buffer) {
  await mkdir(path.dirname(CUSTOM_ZIP_PATH), { recursive: true });
  const temporaryPath = `${CUSTOM_ZIP_PATH}.${process.pid}.tmp`;
  await writeFile(temporaryPath, buffer);
  // Rename keeps readers (the download endpoint) from seeing a half-written file.
  await rename(temporaryPath, CUSTOM_ZIP_PATH);
}

export async function deleteCustomPluginZip() {
  try {
    await unlink(CUSTOM_ZIP_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * The bytes served to users: the superadmin-uploaded archive when one exists,
 * otherwise the plugin sources bundled with this deployment.
 */
export async function resolvePluginZipBytes(): Promise<Buffer> {
  const custom = await readCustomPluginZip();
  if (custom && looksLikeZip(custom)) return custom;
  const bundled = await collectBundledPluginFiles();
  return buildPluginZip(bundled);
}
