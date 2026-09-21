import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import pkg from "../package.json";
import { releasePathViolation, validateUniqueProcessNames } from "../src/lib/release-policy";

const root = process.cwd();
const require = createRequire(import.meta.url);

function gitFiles(args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

async function exists(relativePath: string) {
  return fs.access(path.join(root, relativePath)).then(() => true).catch(() => false);
}

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const required = [
    ".env.example",
    "LICENSE",
    "prisma/schema.prisma",
    "prisma/migrations/20260905000000_phase9_production_readiness/migration.sql",
    "ecosystem.config.cjs",
    "docker-compose.yml",
    "scripts/backup.ts",
  ];
  for (const file of required) if (!await exists(file)) errors.push(`Missing required release file: ${file}`);

  const migrationsRoot = path.join(root, "prisma/migrations");
  const migrationDirectories = await fs.readdir(migrationsRoot, { withFileTypes: true });
  for (const entry of migrationDirectories.filter((entry) => entry.isDirectory())) {
    const file = `prisma/migrations/${entry.name}/migration.sql`;
    try {
      const bytes = await fs.readFile(path.join(root, file));
      // Prisma reads migration scripts as strict UTF-8, not arbitrary bytes.
      const sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!sql.trim() || sql.includes("\u0000")) errors.push(`Empty or NUL-containing migration: ${file}`);
      for (const match of sql.matchAll(/(?:INDEX|CONSTRAINT)\s+`([^`]+)`/gi)) {
        if (Buffer.byteLength(match[1], "utf8") > 64) errors.push(`Migration identifier exceeds 64 bytes: ${file} (${match[1]})`);
      }
    } catch {
      errors.push(`Migration must be readable UTF-8: ${file}`);
    }
  }

  const tracked = gitFiles(["ls-files"]);
  for (const file of tracked) {
    const violation = releasePathViolation(file);
    if (violation) errors.push(`Tracked release violation (${violation}): ${file}`);
  }
  for (const file of gitFiles(["ls-files", "--others", "--exclude-standard"])) {
    const violation = releasePathViolation(file);
    if (violation) warnings.push(`Untracked file excluded from release (${violation}): ${file}`);
  }

  if (pkg.license !== "MIT") errors.push("Root package license must remain MIT");
  const licenses: Record<string, string> = {};
  for (const dependency of Object.keys(pkg.dependencies)) {
    try {
      const manifestPath = path.join(root, "node_modules", ...dependency.split("/"), "package.json");
      const dependencyPackage = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { license?: string; licenses?: string | Array<{ type?: string }> };
      const license = dependencyPackage.license ?? (typeof dependencyPackage.licenses === "string" ? dependencyPackage.licenses : dependencyPackage.licenses?.map((item) => item.type).filter(Boolean).join(" OR ")) ?? "UNKNOWN";
      licenses[dependency] = license;
      if (license === "UNKNOWN") warnings.push(`Dependency license requires manual review: ${dependency}`);
    } catch {
      errors.push(`Cannot inspect dependency license: ${dependency}`);
    }
  }

  const ecosystem = require(path.join(root, "ecosystem.config.cjs")) as { apps?: Array<{ name?: string }> };
  const processNames = ecosystem.apps?.map((item) => item.name ?? "") ?? [];
  if (!validateUniqueProcessNames(processNames, 1)) errors.push("PM2 must define exactly one PesanPro process for the low-memory deployment profile");

  const result = { ok: errors.length === 0, errors, warnings, checks: { requiredFiles: required.length, trackedFiles: tracked.length, productionDependencyLicenses: licenses, pm2Processes: processNames } };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
