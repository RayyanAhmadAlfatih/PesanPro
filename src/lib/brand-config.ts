export const DEFAULT_APP_NAME = "PesanPro";
export const DEFAULT_FAVICON_URL = "/favicon.ico";

export function normalizeBrandAssetUrl(
  value: string | null | undefined,
  fallback = "",
): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  if (/[
\\]/.test(candidate)) return fallback;

  if (candidate.startsWith("/")) {
    if (candidate.startsWith("//")) return fallback;
    try {
      const base = new URL("https://pesanpro.invalid");
      const parsed = new URL(candidate, base);
      if (parsed.origin !== base.origin) return fallback;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return fallback;
    }
  }

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeAppName(value: string | null | undefined) {
  const candidate = value?.trim();
  return candidate ? candidate.slice(0, 160) : DEFAULT_APP_NAME;
}
