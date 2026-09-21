import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pkg from "../package.json";
import { assertPathInside, createBackupManifest, decryptBackupFile, encryptBackupFile, isSafeArchivePath, mysqlDumpGtidOptions, sha256File, verifyBackupManifest, type BackupManifest } from "../src/lib/backup-policy";
import { getEnv } from "../src/lib/env";

type MysqlTarget = { host: string; port: string; user: string; password: string; database: string };

function mysqlTarget(databaseUrl: string): MysqlTarget {
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL must include a database name");
  return { host: url.hostname, port: url.port || "3306", user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database };
}

async function run(command: string, args: string[], options: { stdoutFile?: string; stdinFile?: string; capture?: boolean; env?: Partial<NodeJS.ProcessEnv> } = {}) {
  const stdoutHandle = options.stdoutFile ? await fs.open(options.stdoutFile, "wx", 0o600) : null;
  const stdinHandle = options.stdinFile ? await fs.open(options.stdinFile, "r") : null;
  try {
    return await new Promise<string>((resolve, reject) => {
      let output = "";
      const child = spawn(command, args, {
        shell: false,
        env: { ...process.env, ...options.env },
        stdio: [stdinHandle?.fd ?? "ignore", stdoutHandle?.fd ?? (options.capture ? "pipe" : "inherit"), "inherit"],
      });
      child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 ? resolve(output) : reject(new Error(`${command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`)));
    });
  } finally {
    await stdoutHandle?.close();
    await stdinHandle?.close();
  }
}

function commandArgs(target: MysqlTarget) {
  return [`--host=${target.host}`, `--port=${target.port}`, `--user=${target.user}`, "--default-character-set=utf8mb4", target.database];
}

async function removeSafe(parent: string, candidate: string) {
  assertPathInside(parent, candidate);
  await fs.rm(candidate, { recursive: true, force: true });
}

async function createBackup() {
  const env = getEnv();
  if (!env.BACKUP_ENCRYPTION_PASSPHRASE) throw new Error("BACKUP_ENCRYPTION_PASSPHRASE is required");
  const backupRoot = path.resolve(process.cwd(), env.BACKUP_DIR);
  await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const tempRoot = path.join(backupRoot, `.tmp-create-${crypto.randomUUID()}`);
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const finalPath = path.join(backupRoot, `pesanpro-${timestamp}.ppbackup`);
  const payload = path.join(tempRoot, "payload.tar.gz");
  await fs.mkdir(tempRoot, { recursive: true, mode: 0o700 });

  try {
    const target = mysqlTarget(env.DATABASE_URL);
    // MariaDB's mysqldump compatibility wrapper rejects MySQL's
    // --set-gtid-purged option. Add it only when the installed client
    // advertises support so the same backup command works on both engines.
    const dumpHelp = await run("mysqldump", ["--help"], { capture: true });
    await run("mysqldump", [
      `--host=${target.host}`, `--port=${target.port}`, `--user=${target.user}`,
      "--single-transaction", "--quick", "--routines", "--triggers", "--events",
      "--hex-blob", ...mysqlDumpGtidOptions(dumpHelp), "--default-character-set=utf8mb4", target.database,
    ], { stdoutFile: path.join(tempRoot, "database.sql"), env: { MYSQL_PWD: target.password } });

    const mediaPath = path.resolve(process.cwd(), env.PRIVATE_MEDIA_PATH);
    await fs.mkdir(mediaPath, { recursive: true });
    await run("tar", ["-czf", path.join(tempRoot, "private-media.tar.gz"), "-C", mediaPath, "."]);
    await fs.writeFile(path.join(tempRoot, "metadata.json"), JSON.stringify({
      product: "PesanPro",
      version: pkg.version,
      createdAt: new Date().toISOString(),
      database: { host: target.host, port: target.port, name: target.database },
      includes: ["mysql", "private-media", "encrypted-authstate-in-mysql"],
    }, null, 2), { mode: 0o600 });

    const manifest = await createBackupManifest(tempRoot, ["database.sql", "private-media.tar.gz", "metadata.json"]);
    await fs.writeFile(path.join(tempRoot, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await run("tar", ["-czf", payload, "-C", tempRoot, "database.sql", "private-media.tar.gz", "metadata.json", "manifest.json"]);
    await encryptBackupFile(payload, finalPath, env.BACKUP_ENCRYPTION_PASSPHRASE);
    const checksum = await sha256File(finalPath);
    await fs.writeFile(`${finalPath}.sha256`, `${checksum}  ${path.basename(finalPath)}\n`, { flag: "wx", mode: 0o600 });

    const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 86_400_000;
    for (const name of await fs.readdir(backupRoot)) {
      if (!/^pesanpro-.+\.ppbackup$/.test(name) || name === path.basename(finalPath)) continue;
      const candidate = assertPathInside(backupRoot, path.join(backupRoot, name));
      if ((await fs.stat(candidate)).mtimeMs < cutoff) {
        await fs.unlink(candidate);
        await fs.unlink(`${candidate}.sha256`).catch(() => undefined);
      }
    }
    console.log(JSON.stringify({ ok: true, backup: finalPath, checksum, encrypted: true }));
  } catch (error) {
    await fs.unlink(finalPath).catch(() => undefined);
    await fs.unlink(`${finalPath}.sha256`).catch(() => undefined);
    throw error;
  } finally {
    await removeSafe(backupRoot, tempRoot);
  }
}

async function verifyOrRestore(apply: boolean) {
  const env = getEnv();
  if (!env.BACKUP_ENCRYPTION_PASSPHRASE) throw new Error("BACKUP_ENCRYPTION_PASSPHRASE is required");
  const fileArg = process.argv.find((item) => item.startsWith("--file="))?.slice(7);
  if (!fileArg) throw new Error("Provide --file=/absolute/path/to/backup.ppbackup");
  const backupFile = path.resolve(fileArg);
  if (!backupFile.endsWith(".ppbackup")) throw new Error("Backup file must use .ppbackup");
  const expectedLine = await fs.readFile(`${backupFile}.sha256`, "utf8");
  const expectedChecksum = expectedLine.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expectedChecksum) || await sha256File(backupFile) !== expectedChecksum) throw new Error("Encrypted backup checksum mismatch");

  const parent = path.dirname(backupFile);
  const tempRoot = path.join(parent, `.tmp-restore-${crypto.randomUUID()}`);
  const payload = path.join(tempRoot, "payload.tar.gz");
  const extracted = path.join(tempRoot, "extracted");
  let stagedMedia: string | null = null;
  await fs.mkdir(extracted, { recursive: true, mode: 0o700 });
  try {
    await decryptBackupFile(backupFile, payload, env.BACKUP_ENCRYPTION_PASSPHRASE);
    const entries = (await run("tar", ["-tzf", payload], { capture: true })).split(/\r?\n/).filter(Boolean);
    if (entries.some((entry) => !isSafeArchivePath(entry))) throw new Error("Backup archive contains an unsafe path");
    await run("tar", ["-xzf", payload, "-C", extracted]);
    const manifest = JSON.parse(await fs.readFile(path.join(extracted, "manifest.json"), "utf8")) as BackupManifest;
    await verifyBackupManifest(extracted, manifest);

    if (!apply) {
      console.log(JSON.stringify({ ok: true, mode: "verify-only", backup: backupFile, createdAt: manifest.createdAt, files: manifest.files.length }));
      return;
    }
    if (!process.argv.includes("--confirm=RESTORE_TO_EMPTY_ENVIRONMENT")) throw new Error("Restore requires --confirm=RESTORE_TO_EMPTY_ENVIRONMENT");
    const target = mysqlTarget(env.DATABASE_URL);
    const countOutput = await run("mysql", [...commandArgs(target), "--batch", "--skip-column-names", "--execute=SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()"], { capture: true, env: { MYSQL_PWD: target.password } });
    if (Number(countOutput.trim()) !== 0) throw new Error("Target database is not empty; restore is restricted to an isolated empty environment");
    const mediaPath = path.resolve(process.cwd(), env.PRIVATE_MEDIA_PATH);
    if (mediaPath === path.parse(mediaPath).root) throw new Error("PRIVATE_MEDIA_PATH cannot be a filesystem root");
    await fs.mkdir(mediaPath, { recursive: true });
    if ((await fs.readdir(mediaPath)).length > 0) throw new Error("Target private media directory is not empty");
    const mediaEntries = (await run("tar", ["-tzf", path.join(extracted, "private-media.tar.gz")], { capture: true })).split(/\r?\n/).filter(Boolean);
    if (mediaEntries.some((entry) => !isSafeArchivePath(entry))) throw new Error("Private media archive contains an unsafe path");
    stagedMedia = path.join(path.dirname(mediaPath), `.pesanpro-restore-${crypto.randomUUID()}`);
    await fs.mkdir(stagedMedia, { recursive: true, mode: 0o700 });
    // Fully extract media before touching MySQL so corruption cannot leave a database-only restore.
    await run("tar", ["-xzf", path.join(extracted, "private-media.tar.gz"), "-C", stagedMedia]);
    await run("mysql", commandArgs(target), { stdinFile: path.join(extracted, "database.sql"), env: { MYSQL_PWD: target.password } });
    await fs.rmdir(mediaPath);
    await fs.rename(stagedMedia, mediaPath);
    stagedMedia = null;
    console.log(JSON.stringify({ ok: true, mode: "restored", backup: backupFile, database: target.database, mediaPath }));
  } finally {
    if (stagedMedia) await removeSafe(path.dirname(stagedMedia), stagedMedia);
    await removeSafe(parent, tempRoot);
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "create") await createBackup();
  else if (mode === "verify") await verifyOrRestore(false);
  else if (mode === "restore") await verifyOrRestore(true);
  else if (mode === "--help" || mode === "help") console.log("Usage: backup.ts create | verify --file=... | restore --file=... --confirm=RESTORE_TO_EMPTY_ENVIRONMENT");
  else throw new Error("Usage: backup.ts create | verify --file=... | restore --file=... --confirm=RESTORE_TO_EMPTY_ENVIRONMENT");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
