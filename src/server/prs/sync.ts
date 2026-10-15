import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { comment, pullRequest, repo, task, workspace, type PullRequest } from "@/db/schema";
import { taskNumberFromBranch } from "@/lib/prs/branch";
import { computePriority } from "@/lib/prs/priority";
import { describeGithubError, fetchPull, listOpenPulls, octokitFor, type NormalizedPull } from "@/server/github";

/** Upserts a PR row from GitHub data. Links to a task by explicit id or by branch name. */
export async function upsertPull(
  ws: { id: string; githubPatEnc: string | null },
  r: { id: string; owner: string; name: string },
  data: NormalizedPull,
  opts: { taskId?: string | null; preferBranchLink?: boolean } = {},
): Promise<PullRequest> {
  const existing = await db.query.pullRequest.findFirst({
    where: and(eq(pullRequest.repoId, r.id), eq(pullRequest.number, data.number)),
  });

  let taskId = opts.taskId ?? existing?.taskId ?? null;
  if (!taskId) {
    const n = taskNumberFromBranch(data.branch);
    if (n) {
      const t = await db.query.task.findFirst({ where: and(eq(task.workspaceId, ws.id), eq(task.number, n)) });
      if (t) taskId = t.id;
    }
  }
  const linkedTask = taskId ? await db.query.task.findFirst({ where: eq(task.id, taskId) }) : null;

  const base = {
    workspaceId: ws.id,
    repoId: r.id,
    taskId,
    number: data.number,
    url: data.url,
    title: data.title,
    branch: data.branch,
    baseBranch: data.baseBranch,
    author: data.author,
    state: data.state,
    draft: data.draft,
    ciStatus: data.ciStatus,
    mergeable: data.mergeable,
    additions: data.additions,
    deletions: data.deletions,
    changedFiles: data.changedFiles,
    headSha: data.headSha,
    ghUpdatedAt: data.ghUpdatedAt,
    mergedAt: data.mergedAt,
    closedAt: data.closedAt,
    lastPolledAt: new Date(),
    pollError: null,
    updatedAt: new Date(),
  };
  const pollPriority = computePriority(
    { state: data.state, ghUpdatedAt: data.ghUpdatedAt, createdAt: existing?.createdAt ?? new Date(), taskStatus: linkedTask?.status },
  );

  let row: PullRequest;
  if (existing) {
    [row] = await db
      .update(pullRequest)
      .set({ ...base, pollPriority })
      .where(eq(pullRequest.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(pullRequest)
      .values({ id: randomUUID(), ...base, pollPriority })
      .returning();
  }

  // Merge → system comment on the task (once).
  if (taskId && data.state === "merged" && existing?.state !== "merged") {
    await db.insert(comment).values({
      id: randomUUID(),
      taskId,
      kind: "system",
      body: `Pull request [#${data.number} ${data.title}](${data.url}) was merged into \`${data.baseBranch}\`.`,
    });
  }
  if (taskId && !existing) {
    await db.insert(comment).values({
      id: randomUUID(),
      taskId,
      kind: "system",
      body: `Linked pull request [#${data.number} ${data.title}](${data.url}) (branch \`${data.branch}\`).`,
    });
  }
  return row;
}

export async function syncPullById(prId: string): Promise<{ ok: boolean; error?: string }> {
  const pr = await db.query.pullRequest.findFirst({ where: eq(pullRequest.id, prId), with: { repo: true, workspace: true } });
  if (!pr) return { ok: false, error: "PR not found" };
  try {
    const octokit = octokitFor(pr.workspace);
    const data = await fetchPull(octokit, pr.repo.owner, pr.repo.name, pr.number);
    await upsertPull(pr.workspace, pr.repo, data);
    await clearPollError(pr.workspaceId);
    return { ok: true };
  } catch (err) {
    const msg = describeGithubError(err);
    await db.update(pullRequest).set({ pollError: msg, lastPolledAt: new Date() }).where(eq(pullRequest.id, prId));
    await setPollError(pr.workspaceId, msg);
    return { ok: false, error: msg };
  }
}

/** Finds open PRs in a repo whose branch matches t<number>-… and links them. */
export async function discoverPullsForRepo(repoId: string): Promise<{ linked: number; error?: string }> {
  const r = await db.query.repo.findFirst({ where: eq(repo.id, repoId), with: { workspace: true } });
  if (!r) return { linked: 0, error: "repo not found" };
  if (!r.workspace.githubPatEnc) return { linked: 0 };
  try {
    const octokit = octokitFor(r.workspace);
    const open = await listOpenPulls(octokit, r.owner, r.name);
    const candidates = open.filter((p) => taskNumberFromBranch(p.branch) !== null);
    if (candidates.length === 0) return { linked: 0 };
    const known = await db.query.pullRequest.findMany({
      where: and(eq(pullRequest.repoId, r.id), inArray(pullRequest.number, candidates.map((c) => c.number))),
      columns: { number: true },
    });
    const knownNumbers = new Set(known.map((k) => k.number));
    let linked = 0;
    for (const c of candidates) {
      if (knownNumbers.has(c.number)) continue;
      const n = taskNumberFromBranch(c.branch)!;
      const t = await db.query.task.findFirst({ where: and(eq(task.workspaceId, r.workspaceId), eq(task.number, n)) });
      if (!t) continue;
      const data = await fetchPull(octokit, r.owner, r.name, c.number);
      await upsertPull(r.workspace, r, data, { taskId: t.id });
      linked++;
    }
    await clearPollError(r.workspaceId);
    return { linked };
  } catch (err) {
    const msg = describeGithubError(err);
    await setPollError(r.workspaceId, msg);
    return { linked: 0, error: msg };
  }
}

async function setPollError(workspaceId: string, msg: string) {
  await db.update(workspace).set({ githubPollError: msg, githubPollErrorAt: new Date() }).where(eq(workspace.id, workspaceId));
}
async function clearPollError(workspaceId: string) {
  await db.update(workspace).set({ githubPollError: null, githubPollErrorAt: null }).where(eq(workspace.id, workspaceId));
}
