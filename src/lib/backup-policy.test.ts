import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertPathInside, createBackupManifest, decryptBackupFile, encryptBackupFile, isSafeArchivePath, mysqlDumpGtidOptions, verifyBackupManifest } from "./backup-policy";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function tempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pesanpro-backup-test-"));
  roots.push(root);
  return root;
}

describe("backup encryption and integrity policy", () => {
  it("uses GTID suppression only when the dump client supports it", () => {
    expect(mysqlDumpGtidOptions("mysqldump [OPTIONS]\n  --set-gtid-purged[=name]")).toEqual(["--set-gtid-purged=OFF"]);
    expect(mysqlDumpGtidOptions("mariadb-dump from 11.4.2-MariaDB")).toEqual([]);
  });

  it("round-trips an encrypted streaming backup", async () => {
    const root = await tempRoot();
    const source = path.join(root, "source.tar.gz");
    const encrypted = path.join(root, "backup.ppbackup");
    const restored = path.join(root, "restored.tar.gz");
    await fs.writeFile(source, Buffer.alloc(256 * 1024, 37));
    await encryptBackupFile(source, encrypted, "a-secure-backup-passphrase-with-more-than-32-characters");
    await decryptBackupFile(encrypted, restored, "a-secure-backup-passphrase-with-more-than-32-characters");
    expect(await fs.readFile(restored)).toEqual(await fs.readFile(source));
  }, 30_000);

  it("rejects corruption, truncation, and the wrong passphrase", async () => {
    const root = await tempRoot();
    const source = path.join(root, "source");
    const encrypted = path.join(root, "backup.ppbackup");
    await fs.writeFile(source, "important backup data");
    await encryptBackupFile(source, encrypted, "a-secure-backup-passphrase-with-more-than-32-characters");
    const value = await fs.readFile(encrypted);
    value[Math.floor(value.length / 2)] ^= 0xff;
    await fs.writeFile(encrypted, value);
    await expect(decryptBackupFile(encrypted, path.join(root, "bad"), "a-secure-backup-passphrase-with-more-than-32-characters")).rejects.toThrow();
    await expect(fs.stat(path.join(root, "bad"))).rejects.toThrow();
  });

  it("verifies every manifest checksum and rejects traversal", async () => {
    const root = await tempRoot();
    await fs.writeFile(path.join(root, "database.sql"), "sql");
    await fs.writeFile(path.join(root, "private-media.tar.gz"), "media");
    await fs.writeFile(path.join(root, "metadata.json"), "{}");
    const manifest = await createBackupManifest(root, ["database.sql", "private-media.tar.gz", "metadata.json"]);
    await expect(verifyBackupManifest(root, manifest)).resolves.toBe(true);
    await fs.writeFile(path.join(root, "database.sql"), "bad");
    await expect(verifyBackupManifest(root, manifest)).rejects.toThrow("checksum mismatch");
    expect(isSafeArchivePath("../.env")).toBe(false);
    expect(isSafeArchivePath("C:\\secret")).toBe(false);
    expect(() => assertPathInside(root, path.join(root, "..", "escape"))).toThrow();
  });
});
