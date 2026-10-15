import { Octokit } from "@octokit/rest";
import type { Workspace } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";

export class GithubNotConfigured extends Error {
  constructor() {
    super("This workspace has no GitHub token configured.");
  }
}

export function octokitFor(ws: Pick<Workspace, "githubPatEnc">): Octokit {
  if (!ws.githubPatEnc) throw new GithubNotConfigured();
  const token = decryptSecret(ws.githubPatEnc, env().MASTER_KEY);
  return new Octokit({ auth: token, userAgent: "control-tower" });
}

export async function checkRepo(octokit: Octokit, owner: string, name: string) {
  const { data } = await octokit.repos.get({ owner, repo: name });
  return {
    defaultBranch: data.default_branch,
    pushAccess: Boolean(data.permissions?.push || data.permissions?.admin || data.permissions?.maintain),
    private: data.private,
  };
}

export type CiStatus = "none" | "pending" | "success" | "failure";
export type PrState = "open" | "closed" | "merged";

export type NormalizedPull = {
  number: number;
  url: string;
  title: string;
  branch: string;
  baseBranch: string;
  author: string | null;
  state: PrState;
  draft: boolean;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headSha: string;
  ciStatus: CiStatus;
  ghUpdatedAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
};

export async function fetchPull(octokit: Octokit, owner: string, repo: string, number: number): Promise<NormalizedPull> {
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: number });
  const ciStatus = await fetchCiStatus(octokit, owner, repo, pr.head.sha);
  return {
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    author: pr.user?.login ?? null,
    state: pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open",
    draft: Boolean(pr.draft),
    mergeable: pr.mergeable ?? null,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changed_files ?? 0,
    headSha: pr.head.sha,
    ciStatus,
    ghUpdatedAt: new Date(pr.updated_at),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
  };
}

/** Combines legacy commit statuses and check runs into one CI verdict. */
export async function fetchCiStatus(octokit: Octokit, owner: string, repo: string, sha: string): Promise<CiStatus> {
  const verdicts: CiStatus[] = [];
  try {
    const { data } = await octokit.repos.getCombinedStatusForRef({ owner, repo, ref: sha });
    if (data.total_count > 0) {
      verdicts.push(data.state === "success" ? "success" : data.state === "pending" ? "pending" : "failure");
    }
  } catch {
    /* statuses API may be unavailable for the token; ignore */
  }
  try {
    const { data } = await octokit.checks.listForRef({ owner, repo, ref: sha, per_page: 100 });
    for (const run of data.check_runs) {
      if (run.status !== "completed") verdicts.push("pending");
      else if (run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped") verdicts.push("success");
      else verdicts.push("failure");
    }
  } catch {
    /* checks API requires checks:read; ignore */
  }
  if (verdicts.length === 0) return "none";
  if (verdicts.includes("failure")) return "failure";
  if (verdicts.includes("pending")) return "pending";
  return "success";
}

export async function listOpenPulls(octokit: Octokit, owner: string, repo: string) {
  const pulls = await octokit.paginate(octokit.pulls.list, { owner, repo, state: "open", per_page: 100 });
  return pulls.map((p) => ({ number: p.number, branch: p.head.ref, url: p.html_url, title: p.title }));
}

export async function fetchPullDiff(octokit: Octokit, owner: string, repo: string, number: number): Promise<string> {
  const res = await octokit.pulls.get({
    owner,
    repo,
    pull_number: number,
    mediaType: { format: "diff" },
  });
  return res.data as unknown as string;
}

export function describeGithubError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401) return "GitHub rejected the token (401). Check the PAT in workspace settings.";
  if (e?.status === 403) return "GitHub refused access (403). The PAT may lack permissions or be rate limited.";
  if (e?.status === 404) return "GitHub returned 404. The repo may not exist or the PAT cannot see it.";
  return e?.message ?? String(err);
}
