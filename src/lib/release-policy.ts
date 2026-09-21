export const BANNED_RELEASE_SEGMENTS = new Set([".git", ".next", "node_modules", "data", "uploads", "logs", "backups"]);

export function releasePathViolation(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  const base = segments.at(-1) ?? "";
  if (BANNED_RELEASE_SEGMENTS.has(segments[0]) && base !== ".gitkeep") return "runtime_or_build_data";
  if ((base === ".env" || base.startsWith(".env.")) && base !== ".env.example") return "environment_secret";
  if (/\.sql$/i.test(base) && /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(normalized)) return null;
  if (/\.(?:zip|ppbackup|sql|sqlite|db|pem|key|p12|pfx)$/i.test(base)) return "secret_or_archive";
  if (segments.length === 1 && /^(?:creds|authstate|session)-/i.test(base)) return "whatsapp_credentials";
  return null;
}

export function validateUniqueProcessNames(names: string[], expected: number) {
  return names.length === expected && new Set(names).size === expected && names.every((name) => /^pesanpro(?:-[a-z-]+)?$/.test(name));
}
