import { describe, expect, it } from "vitest";
import { releasePathViolation, validateUniqueProcessNames } from "./release-policy";

describe("release artifact policy", () => {
  it("rejects secrets, runtime data, backups, and archives", () => {
    for (const file of [".env", ".env.production", "data/private-media/a.jpg", "node_modules/x/index.js", "logs/app.log", "backup.ppbackup", "dump.sql", "release.zip", "session-owner.json"]) {
      expect(releasePathViolation(file), file).not.toBeNull();
    }
  });

  it("allows source, migrations, and the environment template", () => {
    for (const file of [".env.example", "src/lib/auth.ts", "src/app/api/webhooks/id/logs/route.ts", "src/components/session-guard.tsx", "data/media/.gitkeep", "prisma/migrations/phase/migration.sql"]) {
      expect(releasePathViolation(file), file).toBeNull();
    }
  });

  it("accepts the single low-memory PM2 process", () => {
    expect(validateUniqueProcessNames(["pesanpro"], 1)).toBe(true);
    expect(validateUniqueProcessNames(["pesanpro", "pesanpro"], 2)).toBe(false);
  });
});
