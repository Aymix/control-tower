import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agentSession,
  comment,
  kbDocument,
  kbVersion,
  orgSettings,
  pullRequest,
  repo,
  runnerToken,
  sessionEvent,
  sessionMessage,
  task,
  taskBlocker,
  usageEntry,
  workspace,
  type AgentSession,
  type RunnerToken,
  type SessionKind,
  type SessionStatus,
} from "@/db/schema";
import { env } from "@/lib/env";
import { branchNameFor } from "@/lib/prs/branch";
import { buildContextPack } from "@/lib/sessions/context-pack";
import { addSystemComment } from "@/server/tasks";

export const ACTIVE_STATUSES: SessionStatus[] = ["queued", "claimed", "starting", "running"];
export const RESUMABLE_STATUSES: SessionStatus[] = ["idle", "interrupted", "budget_reached"];
export const TERMINAL_STATUSES: SessionStatus[] = ["completed", "failed"];

export type RunnerControl = {
  messages: { id: string; kind: "initial" | "steer" | "followup"; body: string }[];
  interrupt: boolean;
  end: boolean;
};

export async function createSession(input: {
  workspaceId: string;
  taskId: string;
  kind: SessionKind;
  instruction: string;
  model?: string | null;
  repoId?: string | null;
  maxBudgetUsd?: number | null;
  createdBy: string;
}): Promise<AgentSession> {
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, input.workspaceId) });
  const t = await db.query.task.findFirst({ where: eq(task.id, input.taskId) });
  if (!ws || !t) throw new Error("Workspace or task not found.");
  let repoId = input.repoId ?? null;
  if (!repoId) {
    const repos = await db.query.repo.findMany({ where: eq(repo.workspaceId, ws.id) });
    if (repos.length === 1) repoId = repos[0].id;
  }
  const r = repoId ? await db.query.repo.findFirst({ where: eq(repo.id, repoId) }) : null;
  const id = randomUUID();
  const branch = input.kind === "implementation" && r ? branchNameFor(t.number, t.title) : null;
  const [s] = await db
    .insert(agentSession)
    .values({
      id,
      workspaceId: ws.id,
      taskId: t.id,
      repoId: r?.id ?? null,
      kind: input.kind,
      status: "queued",
      title: input.instruction.trim().split("\n")[0].slice(0, 120) || (input.kind === "planning" ? "Planning" : "Implementation"),
      model: input.model?.trim() || ws.defaultModel,
      maxBudgetUsd: input.maxBudgetUsd != null ? Math.round(input.maxBudgetUsd * 100) : null,
      createdBy: input.createdBy,
      branch,
      baseBranch: r?.defaultBranch ?? null,
    })
    .returning();
  await db.insert(sessionMessage).values({ id: randomUUID(), sessionId: id, kind: "initial", body: input.instruction, authorId: input.createdBy });
  await addSystemComment(t.id, `Claude ${input.kind} session queued: _${s.title}_.`);
  return s;
}

/** Runner poll: heartbeat, claim queued sessions for this runner's owner, collect control messages. */
export async function pollForRunner(runner: RunnerToken, activeIds: string[]): Promise<{ claimed: string[]; control: Record<string, RunnerControl> }> {
  const now = new Date();
  await db.update(runnerToken).set({ lastSeenAt: now }).where(eq(runnerToken.id, runner.id));
  if (activeIds.length) {
    await db
      .update(agentSession)
      .set({ lastHeartbeatAt: now })
      .where(and(inArray(agentSession.id, activeIds), eq(agentSession.runnerId, runner.id)));
  }
  // Claim: queued sessions created by the runner's owner, either unassigned or sticky to this runner.
  const free = Math.max(0, runner.capacity - activeIds.length);
  const claimed: string[] = [];
  if (free > 0) {
    const candidates = await db.query.agentSession.findMany({
      where: and(
        eq(agentSession.status, "queued"),
        eq(agentSession.createdBy, runner.userId),
        or(isNull(agentSession.runnerId), eq(agentSession.runnerId, runner.id)),
      ),
      orderBy: [asc(agentSession.createdAt)],
      limit: free,
    });
    for (const c of candidates) {
      const [row] = await db
        .update(agentSession)
        .set({ status: "claimed", runnerId: runner.id, claimedAt: now, lastHeartbeatAt: now, attached: true, updatedAt: now })
        .where(and(eq(agentSession.id, c.id), eq(agentSession.status, "queued")))
        .returning({ id: agentSession.id });
      if (row) claimed.push(row.id);
    }
  }
  // Control for everything this runner holds.
  const held = [...new Set([...activeIds, ...claimed])];
  const control: Record<string, RunnerControl> = {};
  if (held.length) {
    const sessions = await db.query.agentSession.findMany({ where: and(inArray(agentSession.id, held), eq(agentSession.runnerId, runner.id)) });
    const pending = await db.query.sessionMessage.findMany({
      where: and(inArray(sessionMessage.sessionId, held), isNull(sessionMessage.deliveredAt), ne(sessionMessage.kind, "initial")),
      orderBy: [asc(sessionMessage.createdAt)],
    });
    for (const s of sessions) {
      const msgs = pending.filter((m) => m.sessionId === s.id);
      control[s.id] = {
        messages: msgs.map((m) => ({ id: m.id, kind: m.kind, body: m.body })),
        interrupt: !!s.interruptRequestedAt,
        end: !!s.endRequestedAt,
      };
    }
    if (pending.length) {
      await db.update(sessionMessage).set({ deliveredAt: now }).where(inArray(sessionMessage.id, pending.map((m) => m.id)));
    }
  }
  return { claimed, control };
}

export async function buildBundle(sessionId: string, runner: RunnerToken) {
  const s = await db.query.agentSession.findFirst({
    where: and(eq(agentSession.id, sessionId), eq(agentSession.runnerId, runner.id)),
    with: { repo: true, workspace: true, task: true },
  });
  if (!s) return null;
  const org = (await db.query.orgSettings.findFirst({ where: eq(orgSettings.id, "org") })) ?? { name: "Control Tower", globalRules: "", guardrails: "" };
  const t = s.task;
  const parent = t.parentId ? await db.query.task.findFirst({ where: eq(task.id, t.parentId) }) : null;
  const siblings = parent ? await db.query.task.findMany({ where: and(eq(task.parentId, parent.id), ne(task.id, t.id)) }) : [];
  const blockerRows = await db.query.taskBlocker.findMany({ where: eq(taskBlocker.taskId, t.id), with: { blockedBy: true } });
  const docs = await db.query.kbDocument.findMany({ where: and(eq(kbDocument.workspaceId, s.workspaceId), isNull(kbDocument.archivedAt)) });
  const docContents = await Promise.all(
    docs
      .filter((d) => d.pinned || d.kind === "scope" || d.kind === "architecture" || d.kind === "decisions")
      .map(async (d) => {
        const v = await db.query.kbVersion.findFirst({ where: and(eq(kbVersion.documentId, d.id), eq(kbVersion.version, d.currentVersion)) });
        return { title: d.title, kind: d.kind, content: v?.content ?? "", pinned: d.pinned };
      }),
  );
  const parentPlanDoc = parent ? docs.find((d) => d.kind === "plan" && d.title.startsWith(`Plan: T-${parent.number}`)) : null;
  const parentPlan = parentPlanDoc
    ? await db.query.kbVersion.findFirst({ where: and(eq(kbVersion.documentId, parentPlanDoc.id), eq(kbVersion.version, parentPlanDoc.currentVersion)) })
    : null;
  const prs = await db.query.pullRequest.findMany({ where: eq(pullRequest.taskId, t.id) });
  const comments = await db.query.comment.findMany({ where: eq(comment.taskId, t.id), with: { author: { columns: { name: true } } }, orderBy: [asc(comment.createdAt)] });
  const initial = await db.query.sessionMessage.findFirst({ where: and(eq(sessionMessage.sessionId, s.id), eq(sessionMessage.kind, "initial")) });

  const pack = buildContextPack({
    kind: s.kind,
    org: { name: org.name, globalRules: org.globalRules, guardrails: org.guardrails },
    workspace: { name: s.workspace.name, clientName: s.workspace.clientName, rules: s.workspace.rules },
    repo: s.repo ? { owner: s.repo.owner, name: s.repo.name, defaultBranch: s.repo.defaultBranch } : null,
    branch: s.branch,
    task: { number: t.number, title: t.title, description: t.description, status: t.status, priority: t.priority, blockedReason: t.blockedReason },
    parent: parent ? { number: parent.number, title: parent.title, description: parent.description, status: parent.status, priority: parent.priority } : null,
    parentPlan: parentPlanDoc && parentPlan ? { title: parentPlanDoc.title, kind: "plan", content: parentPlan.content, pinned: parentPlanDoc.pinned } : null,
    subtasks: siblings.map((x) => ({ number: x.number, title: x.title, description: "", status: x.status, priority: x.priority })),
    blockers: blockerRows.map((b) => ({ number: b.blockedBy.number, title: b.blockedBy.title, description: "", status: b.blockedBy.status, priority: b.blockedBy.priority })),
    docs: docContents,
    prs: prs.map((p) => ({ number: p.number, title: p.title, url: p.url, state: p.state, branch: p.branch, ciStatus: p.ciStatus })),
    comments: comments.map((c) => ({ kind: c.kind, author: c.author?.name ?? null, body: c.body, createdAt: c.createdAt })),
    instruction: initial?.body ?? "",
  });
  if (initial && !initial.deliveredAt) await db.update(sessionMessage).set({ deliveredAt: new Date() }).where(eq(sessionMessage.id, initial.id));

  return {
    session: {
      id: s.id,
      kind: s.kind,
      model: s.model,
      maxBudgetUsd: s.maxBudgetUsd != null ? s.maxBudgetUsd / 100 : null,
      sdkSessionId: s.sdkSessionId,
      branch: s.branch,
      baseBranch: s.baseBranch,
      worktreePath: s.worktreePath,
      lastSeq: s.lastSeq,
      taskNumber: t.number,
      taskTitle: t.title,
      workspaceSlug: s.workspace.slug,
    },
    repo: s.repo ? { owner: s.repo.owner, name: s.repo.name, defaultBranch: s.repo.defaultBranch } : null,
    pack,
    resuming: !!s.sdkSessionId,
  };
}

export async function appendEvents(sessionId: string, runner: RunnerToken, events: { seq: number; type: string; payload: Record<string, unknown> }[]): Promise<number> {
  const s = await db.query.agentSession.findFirst({ where: and(eq(agentSession.id, sessionId), eq(agentSession.runnerId, runner.id)), columns: { id: true, lastSeq: true } });
  if (!s) throw new Error("Session not held by this runner.");
  if (!events.length) return s.lastSeq;
  await db
    .insert(sessionEvent)
    .values(events.map((e) => ({ id: randomUUID(), sessionId, seq: e.seq, type: e.type, payload: e.payload })))
    .onConflictDoNothing();
  const max = Math.max(s.lastSeq, ...events.map((e) => e.seq));
  await db.update(agentSession).set({ lastSeq: max, lastHeartbeatAt: new Date(), updatedAt: new Date() }).where(eq(agentSession.id, sessionId));
  return max;
}

export type StatusPatch = {
  status?: SessionStatus;
  sdkSessionId?: string | null;
  apiKeySource?: string | null;
  branch?: string | null;
  worktreePath?: string | null;
  hasUnpushedCommits?: boolean;
  attached?: boolean;
  error?: string | null;
  claudeVersion?: string | null;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number; numTurns: number };
};

export async function updateSessionStatus(sessionId: string, runner: RunnerToken, patch: StatusPatch): Promise<void> {
  const s = await db.query.agentSession.findFirst({ where: and(eq(agentSession.id, sessionId), eq(agentSession.runnerId, runner.id)), with: { task: { columns: { id: true } } } });
  if (!s) throw new Error("Session not held by this runner.");
  const now = new Date();
  const set: Partial<typeof agentSession.$inferInsert> = { updatedAt: now, lastHeartbeatAt: now };
  if (patch.status && patch.status !== s.status) {
    set.status = patch.status;
    if (patch.status === "running" && !s.startedAt) set.startedAt = now;
    if (TERMINAL_STATUSES.includes(patch.status) || RESUMABLE_STATUSES.includes(patch.status)) set.finishedAt = now;
    if (patch.status !== "running") {
      set.interruptRequestedAt = null;
    }
    if (TERMINAL_STATUSES.includes(patch.status)) {
      set.attached = false;
      set.endRequestedAt = null;
    }
  }
  if (patch.sdkSessionId !== undefined) set.sdkSessionId = patch.sdkSessionId;
  if (patch.apiKeySource !== undefined) {
    set.apiKeySource = patch.apiKeySource;
    await db.update(runnerToken).set({ apiKeySource: patch.apiKeySource, claudeVersion: patch.claudeVersion ?? runner.claudeVersion }).where(eq(runnerToken.id, runner.id));
  }
  if (patch.branch !== undefined) set.branch = patch.branch;
  if (patch.worktreePath !== undefined) set.worktreePath = patch.worktreePath;
  if (patch.hasUnpushedCommits !== undefined) set.hasUnpushedCommits = patch.hasUnpushedCommits;
  if (patch.attached !== undefined) set.attached = patch.attached;
  if (patch.error !== undefined) set.error = patch.error;
  if (patch.usage) {
    const u = patch.usage;
    const costMicros = Math.round(u.costUsd * 1_000_000);
    // Usage is cumulative per SDK session; store deltas in the ledger.
    const delta = {
      inputTokens: Math.max(0, u.inputTokens - s.inputTokens),
      outputTokens: Math.max(0, u.outputTokens - s.outputTokens),
      cacheReadTokens: Math.max(0, u.cacheReadTokens - s.cacheReadTokens),
      cacheWriteTokens: Math.max(0, u.cacheWriteTokens - s.cacheWriteTokens),
      costMicros: Math.max(0, costMicros - s.costMicros),
      numTurns: Math.max(0, u.numTurns - s.numTurns),
    };
    if (delta.costMicros > 0 || delta.inputTokens > 0 || delta.outputTokens > 0) {
      await db.insert(usageEntry).values({ id: randomUUID(), workspaceId: s.workspaceId, sessionId: s.id, userId: s.createdBy, model: s.model, ...delta });
    }
    set.inputTokens = Math.max(s.inputTokens, u.inputTokens);
    set.outputTokens = Math.max(s.outputTokens, u.outputTokens);
    set.cacheReadTokens = Math.max(s.cacheReadTokens, u.cacheReadTokens);
    set.cacheWriteTokens = Math.max(s.cacheWriteTokens, u.cacheWriteTokens);
    set.costMicros = Math.max(s.costMicros, costMicros);
    set.numTurns = Math.max(s.numTurns, u.numTurns);
  }
  await db.update(agentSession).set(set).where(eq(agentSession.id, sessionId));
  if (set.status && set.status !== s.status) {
    const note = set.status === "failed" && patch.error ? ` — ${patch.error}` : "";
    await addSystemComment(s.task.id, `Claude session _${s.title}_ is now **${set.status.replace("_", " ")}**${note}.`);
  }
}

/** Owner/dev actions. */
export async function queueMessage(sessionId: string, kind: "steer" | "followup", body: string, authorId: string): Promise<void> {
  const s = await db.query.agentSession.findFirst({ where: eq(agentSession.id, sessionId) });
  if (!s) throw new Error("Session not found.");
  if (TERMINAL_STATUSES.includes(s.status)) throw new Error("This session has ended. Start a new one.");
  await db.insert(sessionMessage).values({ id: randomUUID(), sessionId, kind, body, authorId });
  // Detached resumable session → re-queue (sticky to the same runner so the SDK transcript is local).
  if (RESUMABLE_STATUSES.includes(s.status) && !s.attached) {
    await db.update(agentSession).set({ status: "queued", updatedAt: new Date(), finishedAt: null, error: null }).where(eq(agentSession.id, sessionId));
  }
}

export async function requestInterrupt(sessionId: string): Promise<void> {
  await db
    .update(agentSession)
    .set({ interruptRequestedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(agentSession.id, sessionId), inArray(agentSession.status, ["claimed", "starting", "running"])));
}

export async function requestEnd(sessionId: string): Promise<void> {
  const s = await db.query.agentSession.findFirst({ where: eq(agentSession.id, sessionId) });
  if (!s) return;
  if (s.status === "queued" || !s.attached) {
    await db.update(agentSession).set({ status: "completed", attached: false, finishedAt: new Date(), updatedAt: new Date() }).where(eq(agentSession.id, sessionId));
    await addSystemComment(s.taskId, `Claude session _${s.title}_ was ended.`);
    return;
  }
  await db.update(agentSession).set({ endRequestedAt: new Date(), updatedAt: new Date() }).where(eq(agentSession.id, sessionId));
}

/** Worker: fail silent sessions and enforce the max duration. */
export async function reapSessions(): Promise<{ silent: number; tooLong: number }> {
  const cfg = env();
  const now = new Date();
  const silentBefore = new Date(now.getTime() - cfg.SESSION_SILENT_MINUTES * 60_000);
  const silent = await db
    .update(agentSession)
    .set({ status: "failed", attached: false, error: `Runner went silent for ${cfg.SESSION_SILENT_MINUTES} minutes.`, finishedAt: now, updatedAt: now })
    .where(and(inArray(agentSession.status, ["claimed", "starting", "running"]), lt(agentSession.lastHeartbeatAt, silentBefore)))
    .returning({ id: agentSession.id, taskId: agentSession.taskId, title: agentSession.title });
  for (const s of silent) await addSystemComment(s.taskId, `Claude session _${s.title}_ **failed**: the runner stopped responding.`);

  const maxBefore = new Date(now.getTime() - cfg.SESSION_MAX_HOURS * 3_600_000);
  const tooLong = await db.query.agentSession.findMany({
    where: and(eq(agentSession.status, "running"), lt(agentSession.startedAt, maxBefore), isNull(agentSession.interruptRequestedAt)),
  });
  for (const s of tooLong) {
    await db.update(agentSession).set({ interruptRequestedAt: now, error: `Exceeded SESSION_MAX_HOURS (${cfg.SESSION_MAX_HOURS}h); interrupting.`, updatedAt: now }).where(eq(agentSession.id, s.id));
  }
  // Also: queued sessions whose creator has no live runner stay queued (UI warns); nothing to do here.
  return { silent: silent.length, tooLong: tooLong.length };
}

export async function workspaceSpendMicros(workspaceId: string): Promise<number> {
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${usageEntry.costMicros}), 0)` }).from(usageEntry).where(eq(usageEntry.workspaceId, workspaceId));
  return Number(row?.total ?? 0);
}

export async function listSessionEvents(sessionId: string, afterSeq: number, limit = 500) {
  return db.query.sessionEvent.findMany({
    where: and(eq(sessionEvent.sessionId, sessionId), sql`${sessionEvent.seq} > ${afterSeq}`),
    orderBy: [asc(sessionEvent.seq)],
    limit,
  });
}

export async function latestSessionsForTask(taskId: string) {
  return db.query.agentSession.findMany({ where: eq(agentSession.taskId, taskId), orderBy: [desc(agentSession.createdAt)], with: { runner: { columns: { name: true, hostname: true } }, creator: { columns: { name: true } } } });
}
