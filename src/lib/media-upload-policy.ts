import { requireEntitlement } from "./billing";
import { getEnv } from "./env";
import { MessageJobError } from "./message-job-errors";

const BYTES_PER_MB = 1024 * 1024;

export type MediaUploadPolicy = {
  /** Effective ceiling after combining the plan with the platform ceiling. */
  maxUploadBytes: number;
  /** The plan's own ceiling, or null when the plan sets no limit. */
  planLimitBytes: number | null;
  /** Hard ceiling from MAX_UPLOAD_SIZE_MB, applied to every plan. */
  platformLimitBytes: number;
};

export function formatMegabytes(bytes: number) {
  const mb = bytes / BYTES_PER_MB;
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export function mediaTooLargeError(maxUploadBytes: number) {
  return new MessageJobError(
    "MEDIA_TOO_LARGE",
    `Media exceeds your plan's ${formatMegabytes(maxUploadBytes)} upload limit`,
    413,
    false,
  );
}

/**
 * Resolves the per-file upload ceiling for a tenant.
 *
 * The plan is authoritative, but the platform ceiling still wins: an operator
 * can lower MAX_UPLOAD_SIZE_MB to protect the server without editing every
 * plan. A denied entitlement (for example an account that has not paid yet)
 * throws instead of silently falling back to the platform ceiling.
 */
export async function getMediaUploadPolicy(userId: string): Promise<MediaUploadPolicy> {
  const platformLimitBytes = getEnv().MAX_UPLOAD_SIZE_MB * BYTES_PER_MB;
  const entitlement = await requireEntitlement(userId, "MEDIA_MAX_UPLOAD_BYTES");
  const planLimitBytes = entitlement.limit === null ? null : Number(entitlement.limit);
  if (planLimitBytes !== null && (!Number.isSafeInteger(planLimitBytes) || planLimitBytes < 0)) {
    throw new MessageJobError("MEDIA_POLICY_INVALID", "The upload limit for this plan is invalid", 500, false);
  }
  const effective = planLimitBytes === null ? platformLimitBytes : Math.min(planLimitBytes, platformLimitBytes);
  return { maxUploadBytes: effective, planLimitBytes, platformLimitBytes };
}
