import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("PPBACKUPv1\0\0\0\0\0\0", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;

export type BackupManifest = {
  format: "pesanpro-backup";
  version: 1;
  createdAt: string;
  files: Array<{ path: string; size: number; sha256: string }>;
};

export function mysqlDumpGtidOptions(helpText: string) {
  return helpText.toLowerCase().includes("set-gtid-purged")
    ? ["--set-gtid-purged=OFF"]
    : [];
}

export function isSafeArchivePath(value: string) {
  if (!value || value.includes("\0") || path.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized || normalized === ".") return true;
  return normalized.split("/").every((part) => part !== ".." && part !== "");
}

export async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function createBackupManifest(root: string, relativePaths: string[], now = new Date()): Promise<BackupManifest> {
  const unique = [...new Set(relativePaths)].sort();
  if (unique.length !== relativePaths.length || unique.some((item) => !isSafeArchivePath(item))) throw new Error("Backup file list is unsafe or contains duplicates");
  const files = await Promise.all(unique.map(async (relativePath) => {
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error("Backup file escapes staging directory");
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new Error(`Backup entry is not a file: ${relativePath}`);
    return { path: relativePath.replaceAll("\\", "/"), size: stat.size, sha256: await sha256File(absolute) };
  }));
  return { format: "pesanpro-backup", version: 1, createdAt: now.toISOString(), files };
}

export async function verifyBackupManifest(root: string, manifest: BackupManifest) {
  if (manifest.format !== "pesanpro-backup" || manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error("Unsupported backup manifest");
  const names = new Set<string>();
  for (const entry of manifest.files) {
    if (!isSafeArchivePath(entry.path) || names.has(entry.path)) throw new Error("Unsafe or duplicate backup manifest entry");
    names.add(entry.path);
    const absolute = path.resolve(root, entry.path);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error("Backup entry escapes restore directory");
    const stat = await fs.stat(absolute);
    if (stat.size !== entry.size) throw new Error(`Backup size mismatch: ${entry.path}`);
    if (await sha256File(absolute) !== entry.sha256) throw new Error(`Backup checksum mismatch: ${entry.path}`);
  }
  for (const required of ["database.sql", "private-media.tar.gz", "metadata.json"]) {
    if (!names.has(required)) throw new Error(`Backup is missing ${required}`);
  }
  return true;
}

export async function encryptBackupFile(inputPath: string, outputPath: string, passphrase: string) {
  if (passphrase.length < 32) throw new Error("Backup encryption passphrase must contain at least 32 characters");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await fs.writeFile(outputPath, Buffer.concat([MAGIC, salt, iv]), { flag: "wx", mode: 0o600 });
  await pipeline(createReadStream(inputPath), cipher, createWriteStream(outputPath, { flags: "a", mode: 0o600 }));
  await fs.appendFile(outputPath, cipher.getAuthTag());
}

export async function decryptBackupFile(inputPath: string, outputPath: string, passphrase: string) {
  if (passphrase.length < 32) throw new Error("Backup encryption passphrase must contain at least 32 characters");
  const stat = await fs.stat(inputPath);
  if (stat.size <= HEADER_BYTES + TAG_BYTES) throw new Error("Encrypted backup is truncated");
  const handle = await fs.open(inputPath, "r");
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    await handle.read(header, 0, HEADER_BYTES, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Encrypted backup header is invalid");
    const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
    const iv = header.subarray(MAGIC.length + SALT_BYTES, HEADER_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, stat.size - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(inputPath, { start: HEADER_BYTES, end: stat.size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(outputPath, { flags: "wx", mode: 0o600 }),
    );
  } catch (error) {
    await fs.unlink(outputPath).catch(() => undefined);
    throw error;
  } finally {
    await handle.close();
  }
}

export function assertPathInside(parent: string, candidate: string) {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedCandidate === resolvedParent || !resolvedCandidate.startsWith(resolvedParent + path.sep)) throw new Error("Path is outside the allowed directory");
  return resolvedCandidate;
}
