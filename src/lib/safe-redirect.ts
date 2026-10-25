export function safeInternalRedirect(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) return fallback;

  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\r\n]/.test(candidate)) {
    return fallback;
  }

  try {
    const base = new URL("https://pesanpro.invalid");
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
