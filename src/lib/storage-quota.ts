import { commitReservedUsage, releaseConsumedUsage, releaseConsumedUsageForTenant, releaseReservedUsage, reserveUsage } from "./usage";

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

export function releaseStorageQuota(input: {
  userId?: string;
  tenantId?: string;
  bytes: number;
  sessionId: string;
  filename: string;
  idempotencyKey?: string;
}) {
  if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) return Promise.resolve({ released: BigInt(0), ledger: null, idempotent: false });
  const common = {
    feature: "MEDIA_STORAGE_BYTES" as const,
    amount: BigInt(input.bytes),
    idempotencyKey: input.idempotencyKey,
    meta: { sessionId: input.sessionId, filename: input.filename },
  };
  if (input.tenantId) {
    return releaseConsumedUsageForTenant({ tenantId: input.tenantId, ...common });
  }
  if (!input.userId) throw new Error("userId or tenantId is required to release storage quota");
  return releaseConsumedUsage({ userId: input.userId, ...common });
}
