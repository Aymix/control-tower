/** Branch naming convention: t<number>-slug (e.g. t42-fix-login). */
const BRANCH_RE = /^t(\d+)(?:-[a-z0-9._/-]*)?$/i;

export function taskNumberFromBranch(branch: string): number | null {
  const m = BRANCH_RE.exec(branch.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function branchNameFor(taskNumber: number, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug ? `t${taskNumber}-${slug}` : `t${taskNumber}`;
}

/** Parses https://github.com/owner/repo/pull/123 (with optional trailing path or query). */
export function parsePullRequestUrl(url: string): { owner: string; repo: string; number: number } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
  const m = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/.exec(u.pathname);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, ""), number: Number.parseInt(m[3], 10) };
}
