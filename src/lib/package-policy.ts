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
