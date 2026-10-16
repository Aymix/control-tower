/** Reference parsing and safety checks for external sources. Pure and unit-tested. */

export function confluencePageRef(ref: string, baseFromConfig?: string): { base: string; pageId: string } | null {
  // https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Title, or a raw id with the base in config
  try {
    const u = new URL(ref);
    const m = /\/pages\/(\d+)/.exec(u.pathname);
    if (!m) return null;
    return { base: `${u.origin}${u.pathname.startsWith("/wiki") ? "/wiki" : ""}`, pageId: m[1] };
  } catch {
    if (/^\d+$/.test(ref.trim()) && baseFromConfig) return { base: baseFromConfig.replace(/\/$/, ""), pageId: ref.trim() };
    return null;
  }
}

export function googleDocId(ref: string): string | null {
  const m = /\/document\/d\/([a-zA-Z0-9_-]{10,})/.exec(ref) ?? /^([a-zA-Z0-9_-]{20,})$/.exec(ref.trim());
  return m ? m[1] : null;
}

export function googleDocExportUrl(id: string): string {
  return `https://docs.google.com/document/d/${id}/export?format=txt`;
}

export function isHttpUrl(ref: string): boolean {
  try {
    const u = new URL(ref);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Blocks obvious SSRF targets for the URL source (loopback, private ranges, link-local, .local/.internal). */
export function isSafePublicUrl(ref: string): boolean {
  if (!isHttpUrl(ref)) return false;
  const host = new URL(ref).hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".home.arpa")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (host === "::1" || host.startsWith("[") || host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return false;
  return true;
}
