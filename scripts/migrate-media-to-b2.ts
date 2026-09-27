import crypto from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { getEnv } from "../src/lib/env";
import { storePaymentProof } from "../src/lib/payment-proof";
import {
  hasPrivateMediaObject,
  loadPrivateMediaObject,
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

function assertIntegrity(input: { buffer: Buffer; checksumSha256: string; sizeBytes: bigint }, label: string) {
  const checksum = crypto.createHash("sha256").update(input.buffer).digest("hex");
  if (checksum !== input.checksumSha256 || BigInt(input.buffer.length) !== input.sizeBytes) {
    throw new Error(`Integrity check failed for ${label}`);
  }
}

async function unlinkIfExists(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function deleteLegacyPaymentProofs(userId: string, verificationId: string) {
  await Promise.all(paymentProofTypes.map(([extension]) => unlinkIfExists(
    resolvePrivateMediaPath(`payment-proofs/${userId}/${verificationId}.${extension}`),
  )));
}

async function migratePrivateMedia(deleteLocal: boolean) {
  const media = await prisma.privateMedia.findMany({ where: { status: { not: "DELETED" } } });
  let uploaded = 0;
  let skipped = 0;
  for (const item of media) {
    if (await hasPrivateMediaObject(item.storagePath)) {
      const remote = await loadPrivateMediaObject({ cacheKey: `migration:${item.id}`, storagePath: item.storagePath });
      if (!remote) throw new Error(`B2 object disappeared for private media ${item.id}`);
      assertIntegrity({ buffer: remote, checksumSha256: item.checksumSha256, sizeBytes: item.sizeBytes }, `private media ${item.id}`);
      if (deleteLocal) await unlinkIfExists(resolvePrivateMediaPath(item.storagePath));
      skipped += 1;
      continue;
    }
    const localPath = resolvePrivateMediaPath(item.storagePath);
    const buffer = await readFile(localPath);
    assertIntegrity({ buffer, checksumSha256: item.checksumSha256, sizeBytes: item.sizeBytes }, `private media ${item.id}`);
    await storePrivateMediaObject({ storagePath: item.storagePath, buffer, mimeType: item.mimeType });
    if (deleteLocal) await unlinkIfExists(localPath);
    uploaded += 1;
    console.info(`private-media ${uploaded + skipped}/${media.length}: ${item.id}`);
  }
  return { uploaded, skipped };
}

async function migratePaymentProofs(deleteLocal: boolean) {
  const verifications = await prisma.paymentVerification.findMany({
    where: { proofUrl: { not: null } },
    select: {
      id: true,
      userId: true,
      proofStoragePath: true,
      proofMimeType: true,
      proofSizeBytes: true,
      proofChecksumSha256: true,
    },
  });
  let uploaded = 0;
  let skipped = 0;
  let missing = 0;
  for (const verification of verifications) {
    if (verification.proofStoragePath && await hasPrivateMediaObject(verification.proofStoragePath)) {
      const remote = await loadPrivateMediaObject({
        cacheKey: `migration-payment-proof:${verification.id}`,
        storagePath: verification.proofStoragePath,
      });
      if (!remote) throw new Error(`B2 object disappeared for payment proof ${verification.id}`);
      if (verification.proofChecksumSha256 && verification.proofSizeBytes !== null) {
        assertIntegrity({
          buffer: remote,
          checksumSha256: verification.proofChecksumSha256,
          sizeBytes: verification.proofSizeBytes,
        }, `payment proof ${verification.id}`);
      }
      if (deleteLocal) await deleteLegacyPaymentProofs(verification.userId, verification.id);
      skipped += 1;
      continue;
    }
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
    if (deleteLocal) await unlinkIfExists(source.localPath);
    uploaded += 1;
    console.info(`payment-proof ${uploaded + skipped + missing}/${verifications.length}: ${verification.id}`);
  }
  return { uploaded, skipped, missing };
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
