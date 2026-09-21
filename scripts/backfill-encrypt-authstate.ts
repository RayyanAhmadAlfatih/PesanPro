/**
 * Gate 0 — Backfill encryption for existing AuthState rows
 * Migrates legacy plaintext `value` (Json) → encrypted `encValue`+iv+authTag (AES-256-GCM)
 * Idempotent: skips rows already encrypted.
 *
 * Usage:
 *   npx tsx scripts/backfill-encrypt-authstate.ts
 *   # or via npm:
 *   npm run db:backfill-encrypt
 *
 * Requires: DATABASE_URL, ENCRYPTION_KEY in env
 */
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

import { getEnv } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import { encrypt } from "../src/lib/crypto";
import { BufferJSON } from "@whiskeysockets/baileys";
import { Prisma } from "@prisma/client";

async function main() {
  const env = getEnv();
  console.log(`[backfill] Starting AuthState encryption backfill (ENCRYPTION_KEY fingerprint: ${env.ENCRYPTION_KEY.slice(0, 8)}...)`);

  const rows = await prisma.authState.findMany();
  console.log(`[backfill] Found ${rows.length} rows`);

  let encrypted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const rec = row as unknown as { encValue?: string | null; iv?: string | null; authTag?: string | null; value: unknown };
    if (rec.encValue && rec.iv && rec.authTag) {
      skipped++;
      continue;
    }
    if (!rec.value) {
      console.warn(`[backfill] Row ${row.id} (${row.key}) has no value and no encValue — skipping`);
      skipped++;
      continue;
    }
    try {
      const serialized = JSON.stringify(rec.value, BufferJSON.replacer as unknown as Parameters<typeof JSON.stringify>[1]);
      const { encValue, iv, authTag } = encrypt(serialized);
      await prisma.authState.update({
        where: { id: row.id },
        data: { encValue, iv, authTag, value: Prisma.DbNull } as unknown as Record<string, unknown>,
      });
      encrypted++;
    } catch (e) {
      failed++;
      console.error(`[backfill] Failed to encrypt ${row.id} (${row.key}):`, e);
    }
  }

  console.log(`[backfill] Done: ${encrypted} encrypted, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("[backfill] Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
