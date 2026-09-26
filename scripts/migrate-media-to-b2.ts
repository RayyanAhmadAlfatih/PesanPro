import crypto from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { getEnv } from "../src/lib/env";
import { storePaymentProof } from "../src/lib/payment-proof";
import {
  hasPrivateMediaObject,
  resolvePrivateMediaPath,
  storePrivateMediaObject,
} from "../src/lib/private-media-storage";
import { prisma } from "../src/lib/prisma";

const paymentProofTypes = [
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["pdf", "application/pdf"],
] as const;

async function migratePrivateMedia(deleteLocal: boolean) {
  const media = await prisma.privateMedia.findMany({ where: { status: { not: "DELETED" } } });
  let uploaded = 0;
  let skipped = 0;
  for (const item of media) {
    if (await hasPrivateMediaObject(item.storagePath)) {
      skipped += 1;
      continue;
    }
    const localPath = resolvePrivateMediaPath(item.storagePath);
    const buffer = await readFile(localPath);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    if (checksum !== item.checksumSha256 || BigInt(buffer.length) !== item.sizeBytes) {
      throw new Error(`Integrity check failed for private media ${item.id}`);
    }
    await storePrivateMediaObject({ storagePath: item.storagePath, buffer, mimeType: item.mimeType });
    if (deleteLocal) await unlink(localPath);
    uploaded += 1;
    console.info(`private-media ${uploaded + skipped}/${media.length}: ${item.id}`);
  }
  return { uploaded, skipped };
}

async function migratePaymentProofs(deleteLocal: boolean) {
  const verifications = await prisma.paymentVerification.findMany({
    where: { proofUrl: { not: null }, proofStoragePath: null },
    select: { id: true, userId: true },
  });
  let uploaded = 0;
  let missing = 0;
  for (const verification of verifications) {
    let source: { buffer: Buffer; mimeType: string; localPath: string } | null = null;
    for (const [extension, mimeType] of paymentProofTypes) {
      const localPath = resolvePrivateMediaPath(`payment-proofs/${verification.userId}/${verification.id}.${extension}`);
      const buffer = await readFile(localPath).catch(() => null);
      if (buffer) {
        source = { buffer, mimeType, localPath };
        break;
      }
    }
    if (!source) {
      missing += 1;
      console.warn(`payment-proof missing local file: ${verification.id}`);
      continue;
    }
    const stored = await storePaymentProof({
      userId: verification.userId,
      verificationId: verification.id,
      declaredMimeType: source.mimeType,
      buffer: source.buffer,
    });
    await prisma.paymentVerification.update({
      where: { id: verification.id },
      data: {
        proofStoragePath: stored.storagePath,
        proofMimeType: stored.mimeType,
        proofSizeBytes: stored.sizeBytes,
        proofChecksumSha256: stored.checksumSha256,
      },
    });
    if (deleteLocal) await unlink(source.localPath);
    uploaded += 1;
    console.info(`payment-proof ${uploaded + missing}/${verifications.length}: ${verification.id}`);
  }
  return { uploaded, missing };
}

async function main() {
  if (getEnv().MEDIA_STORAGE_DRIVER !== "b2") {
    throw new Error("Set MEDIA_STORAGE_DRIVER=b2 before running the migration");
  }
  const deleteLocal = process.argv.includes("--delete-local");
  const privateMedia = await migratePrivateMedia(deleteLocal);
  const paymentProofs = await migratePaymentProofs(deleteLocal);
  console.info(JSON.stringify({ privateMedia, paymentProofs, deleteLocal }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
