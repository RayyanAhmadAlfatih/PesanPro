import { commitReservedUsage, releaseConsumedUsage, releaseReservedUsage, reserveUsage } from "./usage";

export async function runWithStorageQuota<T>(input: {
  userId: string;
  bytes: number;
  sessionId: string;
  filename: string;
}, operation: () => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) throw new Error("Storage size must be a positive safe integer");
  const idempotencyKey = `media:${input.sessionId}:${input.filename}`;
  await reserveUsage({
    userId: input.userId,
    feature: "MEDIA_STORAGE_BYTES",
    amount: BigInt(input.bytes),
    idempotencyKey,
    meta: { sessionId: input.sessionId, filename: input.filename },
  });
  let stored = false;
  try {
    const result = await operation();
    stored = true;
    await commitReservedUsage({ userId: input.userId, feature: "MEDIA_STORAGE_BYTES", idempotencyKey });
    return result;
  } catch (error) {
    if (!stored) {
      await releaseReservedUsage({ userId: input.userId, feature: "MEDIA_STORAGE_BYTES", idempotencyKey }).catch(() => undefined);
    }
    throw error;
  }
}

export function releaseStorageQuota(input: { userId: string; bytes: number; sessionId: string; filename: string }) {
  if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) return Promise.resolve({ released: BigInt(0) });
  return releaseConsumedUsage({
    userId: input.userId,
    feature: "MEDIA_STORAGE_BYTES",
    amount: BigInt(input.bytes),
    meta: { sessionId: input.sessionId, filename: input.filename },
  });
}
