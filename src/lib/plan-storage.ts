/**
 * Renders a `MEDIA_STORAGE_BYTES` entitlement for the sign-up plan cards.
 *
 * The entitlement is stored as a byte count (see the plan migrations); the
 * public price table renders the same values as GB. Keeping the conversion in
 * one pure function lets the cards and the price table agree without changing
 * any price or limit.
 */
export function formatPlanStorage(value: string | number | null | undefined): string | null {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb < 1) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}
