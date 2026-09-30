/**
 * A `next` redirect target we can trust: a path on this site, never another origin.
 * Rejects backslashes (browsers read "/\evil.com" as "//evil.com"), control characters,
 * protocol-relative "//host" and anything not starting with a single "/".
 */
export function safeNextPath(next: unknown, fallback = "/my-day"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "http://x";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
