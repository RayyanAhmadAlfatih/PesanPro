import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  let consumed = BigInt(2048);
  const ledgers = new Map<string, { id: string; amount: bigint; idempotencyKey: string }>();
  const usageCounterFindUnique = vi.fn(async () => ({
    id: "counter-1",
    tenantId: "tenant-1",
    feature: "MEDIA_STORAGE_BYTES",
    consumed,
    reserved: BigInt(0),
  }));
  const usageCounterUpdate = vi.fn(async ({ data }: { data: { consumed: { decrement: bigint } } }) => {
    consumed -= data.consumed.decrement;
    return { id: "counter-1", consumed };
  });
  const usageLedgerFindUnique = vi.fn(async ({ where }: { where: Record<string, Record<string, string>> }) => {
    const key = where.tenantId_feature_operation_idempotencyKey?.idempotencyKey;
    return key ? ledgers.get(key) ?? null : null;
  });
  const usageLedgerCreate = vi.fn(async ({ data }: { data: { amount: bigint; idempotencyKey?: string } }) => {
    const key = data.idempotencyKey ?? "";
    const ledger = { id: `ledger-${ledgers.size + 1}`, amount: data.amount, idempotencyKey: key };
    if (key) ledgers.set(key, ledger);
    return ledger;
  });
  const tx = {
    usageCounter: { findUnique: usageCounterFindUnique, update: usageCounterUpdate },
    usageLedger: { findUnique: usageLedgerFindUnique, create: usageLedgerCreate },
  };
  return {
    tx,
    reset() {
      consumed = BigInt(2048);
      ledgers.clear();
      usageCounterFindUnique.mockClear();
      usageCounterUpdate.mockClear();
      usageLedgerFindUnique.mockClear();
      usageLedgerCreate.mockClear();
    },
    consumed: () => consumed,
  };
});

vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: typeof fixture.tx) => unknown) => callback(fixture.tx)),
    usageLedger: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("./billing", () => ({
  requireEntitlement: vi.fn(),
  resolveTenantId: vi.fn(),
}));

import { releaseConsumedUsageForTenant } from "./usage";

describe("idempotent consumed storage release", () => {
  beforeEach(() => fixture.reset());

  it("decrements storage usage exactly once for the same cleanup key", async () => {
    const input = {
      tenantId: "tenant-1",
      feature: "MEDIA_STORAGE_BYTES" as const,
      amount: BigInt(1024),
      idempotencyKey: "private-media-cleanup:media-1",
      meta: { mediaId: "media-1" },
    };

    const first = await releaseConsumedUsageForTenant(input);
    const second = await releaseConsumedUsageForTenant(input);

    expect(first).toMatchObject({ released: BigInt(1024), idempotent: false });
    expect(second).toMatchObject({ released: BigInt(1024), idempotent: true });
    expect(fixture.consumed()).toBe(BigInt(1024));
    expect(fixture.tx.usageCounter.update).toHaveBeenCalledOnce();
    expect(fixture.tx.usageLedger.create).toHaveBeenCalledOnce();
  });
});
