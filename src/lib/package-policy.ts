export type BroadcastPackagePolicy = {
  recipientLimit: bigint | null;
  minimumDelayMs: bigint | null;
};

export type BroadcastPackageViolation = {
  code: "BROADCAST_BATCH_LIMIT_EXCEEDED" | "BROADCAST_DELAY_TOO_SHORT";
  message: string;
} | null;

export function validateBroadcastPackageLimits(
  input: { recipientCount: number; delayMinMs: number },
  policy: BroadcastPackagePolicy,
): BroadcastPackageViolation {
  if (policy.recipientLimit !== null && BigInt(input.recipientCount) > policy.recipientLimit) {
    return {
      code: "BROADCAST_BATCH_LIMIT_EXCEEDED",
      message: `Paket ini mengizinkan maksimal ${policy.recipientLimit.toString()} penerima per batch`,
    };
  }
  if (policy.minimumDelayMs !== null && BigInt(input.delayMinMs) < policy.minimumDelayMs) {
    return {
      code: "BROADCAST_DELAY_TOO_SHORT",
      message: `Paket ini mewajibkan delay broadcast minimal ${Number(policy.minimumDelayMs) / 1000} detik`,
    };
  }
  return null;
}

/**
 * New accounts are provisioned on the default plan without paying. Marking a
 * paid plan as default would therefore give every new registration a free,
 * never-expiring subscription. Only a plan with no monthly price may be the
 * default.
 */
export function isPlanEligibleAsDefault(priceMonthly: string | number | null | undefined): boolean {
  if (priceMonthly === null || priceMonthly === undefined || priceMonthly === "") return true;
  const amount = Number(priceMonthly);
  return Number.isFinite(amount) && amount <= 0;
}
