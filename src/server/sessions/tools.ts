import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { agentSession, kbDocument, kbVersion, task, type RunnerToken } from "@/db/schema";
import { checkTransition, systemCommentForTransition } from "@/lib/tasks/transitions";
import { describeGithubError, fetchPull, GithubNotConfigured, octokitFor } from "@/server/github";
import { upsertPull } from "@/server/prs/sync";
import { createProposalBatch } from "@/server/proposals";
import { addAgentComment, addSystemComment } from "@/server/tasks";
import { submitBriefingDraft } from "@/server/briefings/service";

/** Tool schemas are shared with the runner (which exposes them to Claude as MCP tools). */
export const TOOL_SCHEMAS = {
  open_pull_request: z.object({
    title: z.string().min(1).max(200),
    body: z.string().max(20_000).default(""),
    branch: z.string().min(1).optional().describe("Head branch; defaults to the session branch"),
    draft: z.boolean().default(false),
  }),
  report_blocker: z.object({
    reason: z.string().min(1).max(2000),
    details: z.string().max(10_000).default("").describe("What you tried, what you need from the owner or client"),
  }),
  submit_plan: z.object({
    summary: z.string().min(1).max(10_000).describe("Short summary of the approach"),
    plan: z.string().min(1).max(60_000).describe("The full plan in markdown; saved to the knowledge base"),
    proposals: z
      .array(
        z.object({
          key: z.string().min(1).max(20).describe("Stable key like p1, p2 used in dependsOn"),
          title: z.string().min(1).max(200),
          body: z.string().max(10_000).default("").describe("What to do"),
          acceptanceCriteria: z.string().max(10_000).default(""),
          dependsOn: z.array(z.string()).default([]),
        }),
      )
      .max(50)
      .default([]),
  }),
  submit_briefing: z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(40_000).describe("The client-facing text in markdown"),
    notes: z.string().max(4000).optional().describe("Assumptions or open points for the owner, never sent to the client"),
  }),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

export async function runSessionTool(sessionId: string, runner: RunnerToken, name: string, rawArgs: unknown): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const s = await db.query.agentSession.findFirst({
    where: and(eq(agentSession.id, sessionId), eq(agentSession.runnerId, runner.id)),
    with: { task: true, workspace: true, repo: true },
  });
  if (!s) return { ok: false, error: "Session not held by this runner." };
  const t = s.task;
  try {
    switch (name as ToolName) {
      case "open_pull_request": {
        if (s.kind !== "implementation") return { ok: false, error: "open_pull_request is only available in implementation sessions." };
        const args = TOOL_SCHEMAS.open_pull_request.parse(rawArgs);
        if (!s.repo) return { ok: false, error: "This session has no repository." };
        const head = args.branch ?? s.branch;
        if (!head) return { ok: false, error: "No branch to open a PR from." };
        if (head === s.repo.defaultBranch) return { ok: false, error: "Refusing to open a PR from the default branch." };
        const octokit = octokitFor(s.workspace);
        let number: number;
        try {
          const { data } = await octokit.pulls.create({ owner: s.repo.owner, repo: s.repo.name, title: args.title, body: args.body, head, base: s.repo.defaultBranch, draft: args.draft });
          number = data.number;
        } catch (err) {
          const e = err as { status?: number; message?: string };
          if (e.status === 422 && /already exists/i.test(e.message ?? "")) {
            const { data } = await octokit.pulls.list({ owner: s.repo.owner, repo: s.repo.name, head: `${s.repo.owner}:${head}`, state: "open" });
            if (!data[0]) throw err;
            number = data[0].number;
          } else throw err;
        }
        const data = await fetchPull(octokit, s.repo.owner, s.repo.name, number);
        const pr = await upsertPull(s.workspace, s.repo, data, { taskId: t.id });
        await db.update(agentSession).set({ pullRequestId: pr.id, updatedAt: new Date() }).where(eq(agentSession.id, s.id));
        if (t.status !== "in_review" && t.status !== "done") {
          const check = checkTransition({ from: t.status, to: "in_review", role: "dev" });
          if (check.ok) {
            await db.update(task).set({ status: "in_review", blockedReason: null, updatedAt: new Date() }).where(eq(task.id, t.id));
            await addSystemComment(t.id, systemCommentForTransition(t.status, "in_review", "Claude"));
          }
        }
        await addAgentComment(t.id, `Opened pull request [#${number} ${args.title}](${data.url}).`);
        return { ok: true, result: `Pull request #${number} opened: ${data.url}. The task is now In review.` };
      }
      case "report_blocker": {
        const args = TOOL_SCHEMAS.report_blocker.parse(rawArgs);
        const check = checkTransition({ from: t.status, to: "blocked", role: "dev", blockedReason: args.reason });
        if (check.ok && t.status !== "blocked") {
          await db.update(task).set({ status: "blocked", blockedReason: args.reason, updatedAt: new Date() }).where(eq(task.id, t.id));
          await addSystemComment(t.id, systemCommentForTransition(t.status, "blocked", "Claude", args.reason));
        } else if (t.status === "blocked") {
          await db.update(task).set({ blockedReason: args.reason, updatedAt: new Date() }).where(eq(task.id, t.id));
        }
        await addAgentComment(t.id, `**Blocker:** ${args.reason}${args.details ? `\n\n${args.details}` : ""}`);
        return { ok: true, result: "Blocker recorded; the task is marked Blocked and the owner has been notified. Stop working on this task unless you can proceed without the blocked item." };
      }
      case "submit_plan": {
        const args = TOOL_SCHEMAS.submit_plan.parse(rawArgs);
        const title = `Plan: T-${t.number} ${t.title}`.slice(0, 200);
        const existing = await db.query.kbDocument.findFirst({ where: and(eq(kbDocument.workspaceId, s.workspaceId), eq(kbDocument.title, title)) });
        let docId: string;
        if (existing) {
          const next = existing.currentVersion + 1;
          await db.insert(kbVersion).values({ id: randomUUID(), documentId: existing.id, version: next, content: args.plan, note: `Planning session ${s.id.slice(0, 8)}` });
          await db.update(kbDocument).set({ currentVersion: next, updatedAt: new Date(), archivedAt: null }).where(eq(kbDocument.id, existing.id));
          docId = existing.id;
        } else {
          docId = randomUUID();
          await db.insert(kbDocument).values({ id: docId, workspaceId: s.workspaceId, kind: "plan", title, createdBy: s.createdBy });
          await db.insert(kbVersion).values({ id: randomUUID(), documentId: docId, version: 1, content: args.plan, note: `Planning session ${s.id.slice(0, 8)}` });
        }
        let batchId: string | null = null;
        if (args.proposals.length) {
          batchId = await createProposalBatch(s.workspaceId, s.createdBy, {
            title: `Plan for T-${t.number}: ${t.title}`.slice(0, 200),
            summary: args.summary,
            source: "planning",
            sourceTaskId: t.id,
            sourceSessionId: s.id,
            items: args.proposals,
          });
        }
        await addAgentComment(t.id, `**Plan submitted.** ${args.summary}\n\nSaved to the knowledge base as _${title}_${batchId ? ` with ${args.proposals.length} proposal(s) to review.` : "."}`);
        return { ok: true, result: `Plan saved as "${title}"${batchId ? ` and ${args.proposals.length} proposals were created for the owner to review` : ""}. You can stop here.` };
      }
      case "submit_briefing": {
        if (s.kind !== "briefing") return { ok: false, error: "submit_briefing is only available in briefing sessions." };
        const args = TOOL_SCHEMAS.submit_briefing.parse(rawArgs);
        const msg = await submitBriefingDraft(s.id, args);
        return { ok: true, result: msg };
      }
      default:
        return { ok: false, error: `Unknown tool ${name}.` };
    }
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: `Invalid arguments: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    if (err instanceof GithubNotConfigured) return { ok: false, error: err.message };
    return { ok: false, error: describeGithubError(err) };
  }
}
