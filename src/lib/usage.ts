import { EntitlementFeature, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { requireEntitlement, resolveTenantId } from "./billing";

export class QuotaExceededError extends Error {
  constructor(
    public readonly feature: EntitlementFeature,
    public readonly limit: bigint,
  ) {
    super(`Quota exceeded for ${feature}`);
    this.name = "QuotaExceededError";
  }
}

export interface UsagePeriod {
  start: Date;
  end: Date;
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function anniversary(anchor: Date, year: number, month: number): Date {
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(Date.UTC(
    year,
    month,
    day,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  ));
}

export function getUsagePeriod(anchor: Date, now = new Date()): UsagePeriod {
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let start = anniversary(anchor, year, month);
  if (start > now) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    start = anniversary(anchor, year, month);
  }

  let endMonth = month + 1;
  let endYear = year;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }
  return { start, end: anniversary(anchor, endYear, endMonth) };
}

function assertPositiveAmount(amount: bigint) {
  if (amount <= BigInt(0)) throw new Error("Usage amount must be positive");
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Usage transaction failed after retries");
}

async function getOrCreateCounter(
  tx: Prisma.TransactionClient,
  tenantId: string,
  feature: EntitlementFeature,
  now: Date,
) {
  if (feature === "MEDIA_STORAGE_BYTES") {
    const periodStart = new Date("1970-01-01T00:00:00.000Z");
    const periodEnd = new Date("9999-12-31T23:59:59.999Z");
    return tx.usageCounter.upsert({
      where: { tenantId_feature_periodStart: { tenantId, feature, periodStart } },
      update: { periodEnd },
      create: { tenantId, feature, periodStart, periodEnd },
    });
  }
  const subscription = await tx.subscription.findUnique({
    where: { userId: tenantId },
    select: { startsAt: true },
  });
  const period = getUsagePeriod(subscription?.startsAt ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), now);

  return tx.usageCounter.upsert({
    where: {
      tenantId_feature_periodStart: { tenantId, feature, periodStart: period.start },
    },
    update: { periodEnd: period.end },
    create: {
      tenantId,
      feature,
      periodStart: period.start,
      periodEnd: period.end,
    },
  });
}

export async function consumeUsage(input: {
  userId: string;
  feature: EntitlementFeature;
  amount?: bigint;
  idempotencyKey?: string;
  apiKeyId?: string;
  meta?: Prisma.InputJsonValue;
}) {
  const amount = input.amount ?? BigInt(1);
  assertPositiveAmount(amount);

  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const tenantId = await resolveTenantId(input.userId, tx);
    if (!tenantId) throw new Error("Billing tenant not found");

    if (input.idempotencyKey) {
      const existing = await tx.usageLedger.findUnique({
        where: {
          tenantId_feature_operation_idempotencyKey: {
            tenantId,
            feature: input.feature,
            operation: "COMMIT",
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return { ledger: existing, idempotent: true };
    }

    const entitlement = await requireEntitlement(input.userId, input.feature, tx);
    const counter = await getOrCreateCounter(tx, tenantId, input.feature, new Date());
    if (entitlement.limit !== null && counter.consumed + counter.reserved + amount > entitlement.limit) {
      throw new QuotaExceededError(input.feature, entitlement.limit);
    }

    await tx.usageCounter.update({
      where: { id: counter.id },
      data: { consumed: { increment: amount } },
    });
    const ledger = await tx.usageLedger.create({
      data: {
        tenantId,
        counterId: counter.id,
        apiKeyId: input.apiKeyId,
        feature: input.feature,
        operation: "COMMIT",
        amount,
        idempotencyKey: input.idempotencyKey,
        meta: input.meta,
      },
    });
    return { ledger, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export async function reserveUsage(input: {
  userId: string;
  feature: EntitlementFeature;
  amount: bigint;
  idempotencyKey: string;
  apiKeyId?: string;
  meta?: Prisma.InputJsonValue;
}) {
  assertPositiveAmount(input.amount);
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const tenantId = await resolveTenantId(input.userId, tx);
    if (!tenantId) throw new Error("Billing tenant not found");

    const existing = await tx.usageLedger.findUnique({
      where: {
        tenantId_feature_operation_idempotencyKey: {
          tenantId,
          feature: input.feature,
          operation: "RESERVE",
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return { ledger: existing, idempotent: true };

    const entitlement = await requireEntitlement(input.userId, input.feature, tx);
    const counter = await getOrCreateCounter(tx, tenantId, input.feature, new Date());
    if (entitlement.limit !== null && counter.consumed + counter.reserved + input.amount > entitlement.limit) {
      throw new QuotaExceededError(input.feature, entitlement.limit);
    }

    await tx.usageCounter.update({
      where: { id: counter.id },
      data: { reserved: { increment: input.amount } },
    });
    const ledger = await tx.usageLedger.create({
      data: {
        tenantId,
        counterId: counter.id,
        apiKeyId: input.apiKeyId,
        feature: input.feature,
        operation: "RESERVE",
        amount: input.amount,
        idempotencyKey: input.idempotencyKey,
        meta: input.meta,
      },
    });
    return { ledger, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

async function settleReservation(input: {
  userId: string;
  feature: EntitlementFeature;
  idempotencyKey: string;
  operation: "COMMIT" | "RELEASE";
}) {
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const tenantId = await resolveTenantId(input.userId, tx);
    if (!tenantId) throw new Error("Billing tenant not found");

    const existing = await tx.usageLedger.findUnique({
      where: {
        tenantId_feature_operation_idempotencyKey: {
          tenantId,
          feature: input.feature,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return { ledger: existing, idempotent: true };

    const reservation = await tx.usageLedger.findUnique({
      where: {
        tenantId_feature_operation_idempotencyKey: {
          tenantId,
          feature: input.feature,
          operation: "RESERVE",
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!reservation?.counterId) throw new Error("Usage reservation not found");

    const counter = await tx.usageCounter.findUnique({ where: { id: reservation.counterId } });
    if (!counter || counter.reserved < reservation.amount) throw new Error("Usage reservation is inconsistent");

    await tx.usageCounter.update({
      where: { id: counter.id },
      data: input.operation === "COMMIT"
        ? { reserved: { decrement: reservation.amount }, consumed: { increment: reservation.amount } }
        : { reserved: { decrement: reservation.amount } },
    });
    const ledger = await tx.usageLedger.create({
      data: {
        tenantId,
        counterId: counter.id,
        apiKeyId: reservation.apiKeyId,
        feature: input.feature,
        operation: input.operation,
        amount: reservation.amount,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { ledger, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export function commitReservedUsage(input: Omit<Parameters<typeof settleReservation>[0], "operation">) {
  return settleReservation({ ...input, operation: "COMMIT" });
}

export function releaseReservedUsage(input: Omit<Parameters<typeof settleReservation>[0], "operation">) {
  return settleReservation({ ...input, operation: "RELEASE" });
}

export async function releaseConsumedUsage(input: {
  userId: string;
  feature: "MEDIA_STORAGE_BYTES";
  amount: bigint;
  meta?: Prisma.InputJsonValue;
}) {
  assertPositiveAmount(input.amount);
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const tenantId = await resolveTenantId(input.userId, tx);
    if (!tenantId) throw new Error("Billing tenant not found");
    const counter = await getOrCreateCounter(tx, tenantId, input.feature, new Date());
    const released = counter.consumed < input.amount ? counter.consumed : input.amount;
    if (released === BigInt(0)) return { released };
    await tx.usageCounter.update({ where: { id: counter.id }, data: { consumed: { decrement: released } } });
    await tx.usageLedger.create({
      data: {
        tenantId,
        counterId: counter.id,
        feature: input.feature,
        operation: "ADJUST",
        amount: -released,
        meta: input.meta,
      },
    });
    return { released };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}
