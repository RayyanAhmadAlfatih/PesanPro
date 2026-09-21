import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { commitReservedUsage, releaseReservedUsage, reserveUsage } from "./usage";
import { checkPersistentRateLimit, type RateLimitResult } from "./rate-limit";

export class MessageSafetyRateLimitError extends Error {
  constructor(public readonly result: RateLimitResult, public readonly limit: number) {
    super("Message safety rate limit exceeded");
    this.name = "MessageSafetyRateLimitError";
  }
}

export async function runWithMessageQuota<T>(input: {
  userId: string;
  amount?: number;
  apiKeyId?: string;
  sessionId: string;
  endpoint: string;
}, operation: () => Promise<T>): Promise<T> {
  const safetyLimit = 30;
  const rateLimit = await checkPersistentRateLimit(`message-device:${input.sessionId}`, safetyLimit, 60_000);
  if (!rateLimit.success) throw new MessageSafetyRateLimitError(rateLimit, safetyLimit);
  const idempotencyKey = crypto.randomUUID();
  const amount = BigInt(input.amount ?? 1);
  await reserveUsage({
    userId: input.userId,
    feature: "MESSAGES_MONTHLY",
    amount,
    idempotencyKey,
    apiKeyId: input.apiKeyId,
    meta: { sessionId: input.sessionId, endpoint: input.endpoint } satisfies Prisma.InputJsonValue,
  });

  let operationCompleted = false;
  try {
    const result = await operation();
    operationCompleted = true;
    await commitReservedUsage({ userId: input.userId, feature: "MESSAGES_MONTHLY", idempotencyKey });
    return result;
  } catch (error) {
    // A successful send with a failed commit stays reserved for safe reconciliation.
    if (!operationCompleted) {
      await releaseReservedUsage({ userId: input.userId, feature: "MESSAGES_MONTHLY", idempotencyKey }).catch(() => undefined);
    }
    throw error;
  }
}
