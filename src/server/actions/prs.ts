"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pullRequest, repo, task } from "@/db/schema";
import { parsePullRequestUrl } from "@/lib/prs/branch";
import { audit } from "@/server/audit";
import { requireUser, requireWorkspaceById } from "@/server/auth";
import { describeGithubError, fetchPull, GithubNotConfigured, octokitFor } from "@/server/github";
import { syncPullById, upsertPull } from "@/server/prs/sync";
import { addSystemComment } from "@/server/tasks";
import { fail, ok, run, type ActionResult } from "./result";

export async function linkPullRequestByUrl(taskId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const t = await db.query.task.findFirst({ where: eq(task.id, taskId) });
    if (!t) return fail("Task not found.");
    const ws = await requireWorkspaceById(me, t.workspaceId);
    const parsed = parsePullRequestUrl(String(formData.get("url") ?? ""));
    if (!parsed) return fail("Paste a GitHub pull request URL (https://github.com/owner/repo/pull/123).");
    const r = await db.query.repo.findFirst({ where: and(eq(repo.workspaceId, ws.id), eq(repo.owner, parsed.owner), eq(repo.name, parsed.repo)) });
    if (!r) return fail(`${parsed.owner}/${parsed.repo} is not registered in this workspace. Add it under Repos first.`);
    try {
      const data = await fetchPull(octokitFor(ws), r.owner, r.name, parsed.number);
      const existing = await db.query.pullRequest.findFirst({ where: and(eq(pullRequest.repoId, r.id), eq(pullRequest.number, parsed.number)) });
      if (existing?.taskId && existing.taskId !== t.id) {
        const other = await db.query.task.findFirst({ where: eq(task.id, existing.taskId) });
        return fail(`This PR is already linked to T-${other?.number ?? "?"}.`);
      }
      await upsertPull(ws, r, data, { taskId: t.id });
      if (existing && !existing.taskId) await addSystemComment(t.id, `Linked pull request [#${data.number} ${data.title}](${data.url}).`);
    } catch (err) {
      return fail(err instanceof GithubNotConfigured ? err.message : describeGithubError(err));
    }
    await audit({ actorId: me.id, workspaceId: ws.id, action: "pr.linked", entityType: "task", entityId: t.id, meta: { number: parsed.number } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

export async function unlinkPullRequest(prId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const pr = await db.query.pullRequest.findFirst({ where: eq(pullRequest.id, prId) });
    if (!pr) return fail("PR not found.");
    const ws = await requireWorkspaceById(me, pr.workspaceId);
    await db.update(pullRequest).set({ taskId: null, updatedAt: new Date() }).where(eq(pullRequest.id, pr.id));
    if (pr.taskId) await addSystemComment(pr.taskId, `**${me.name}** unlinked pull request [#${pr.number}](${pr.url}).`);
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

export async function refreshPullRequest(prId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const pr = await db.query.pullRequest.findFirst({ where: eq(pullRequest.id, prId) });
    if (!pr) return fail("PR not found.");
    const ws = await requireWorkspaceById(me, pr.workspaceId);
    const res = await syncPullById(pr.id);
    revalidatePath(`/w/${ws.slug}`, "layout");
    return res.ok ? ok() : fail(res.error ?? "Refresh failed.");
  });
}
