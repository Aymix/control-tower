import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { agentSession, briefing, briefingEdit, comment, kbDocument, kbVersion, orgSettings, pullRequest, sessionMessage, task, user, workspace, type Briefing, type BriefingKind } from "@/db/schema";
import { buildBriefingPack } from "@/lib/briefings/pack";
import { addSystemComment } from "@/server/tasks";

const KIND_TITLE: Record<BriefingKind, string> = {
  status_update: "Status update",
  pre_task_questions: "Questions before starting",
  blocker: "Blocker",
  release_notes: "Release notes",
};

/** Creates the briefing row and the drafting session (kind "briefing") on the owner's runner. */
export async function createBriefing(input: { workspaceId: string; kind: BriefingKind; taskId?: string | null; instructions: string; createdBy: string; model?: string | null }): Promise<Briefing> {
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, input.workspaceId) });
  if (!ws) throw new Error("Workspace not found.");
  let t = null;
  if (input.taskId) {
    t = await db.query.task.findFirst({ where: and(eq(task.id, input.taskId), eq(task.workspaceId, ws.id)) });
    if (!t) throw new Error("Task not found.");
  }
  if ((input.kind === "pre_task_questions" || input.kind === "blocker") && !t) throw new Error("Pick the task this briefing is about.");
  const id = randomUUID();
  const title = t ? `${KIND_TITLE[input.kind]}: T-${t.number} ${t.title}` : `${KIND_TITLE[input.kind]} — ${new Date().toISOString().slice(0, 10)}`;
  await db.insert(briefing).values({ id, workspaceId: ws.id, taskId: t?.id ?? null, kind: input.kind, status: "queued", title: title.slice(0, 200), instructions: input.instructions, createdBy: input.createdBy });
  const sessionId = await startDraftingSession({ briefingId: id, workspaceId: ws.id, taskId: t?.id ?? null, createdBy: input.createdBy, model: input.model ?? ws.defaultModel, title, instructions: input.instructions });
  await db.update(briefing).set({ sessionId }).where(eq(briefing.id, id));
  return (await db.query.briefing.findFirst({ where: eq(briefing.id, id) }))!;
}

async function startDraftingSession(input: { briefingId: string; workspaceId: string; taskId: string | null; createdBy: string; model: string; title: string; instructions: string }): Promise<string> {
  // Briefing sessions need a task row for the FK; use the bound task or a hidden anchor task per workspace.
  const taskId = input.taskId ?? (await anchorTaskId(input.workspaceId, input.createdBy));
  const sessionId = randomUUID();
  await db.insert(agentSession).values({
    id: sessionId,
    workspaceId: input.workspaceId,
    taskId,
    kind: "briefing",
    status: "queued",
    title: `Draft: ${input.title}`.slice(0, 120),
    model: input.model,
    createdBy: input.createdBy,
  });
  await db.insert(sessionMessage).values({ id: randomUUID(), sessionId, kind: "initial", body: input.instructions || "(no extra instructions)", authorId: input.createdBy });
  return sessionId;
}

/** A hidden per-workspace task that workspace-level briefings hang off (never shown on the board). */
async function anchorTaskId(workspaceId: string, createdBy: string): Promise<string> {
  const existing = await db.query.task.findFirst({ where: and(eq(task.workspaceId, workspaceId), eq(task.number, 0)) });
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(task).values({ id, workspaceId, number: 0, title: "Client communication (briefings)", description: "Internal anchor for workspace-level briefings.", status: "done", createdBy, position: -1 });
  return id;
}

export async function briefingForSession(sessionId: string) {
  return db.query.briefing.findFirst({ where: eq(briefing.sessionId, sessionId) });
}

/** Gathers everything the pack needs for a briefing session. */
export async function buildBriefingPackForSession(sessionId: string) {
  const b = await briefingForSession(sessionId);
  if (!b) return null;
  const ws = (await db.query.workspace.findFirst({ where: eq(workspace.id, b.workspaceId) }))!;
  const org = (await db.query.orgSettings.findFirst({ where: eq(orgSettings.id, "org") })) ?? { name: "Control Tower", styleGuide: "" };
  const owner = (await db.query.user.findFirst({ where: eq(user.role, "owner") })) ?? { name: "the owner" };
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);
  const tasks = await db.query.task.findMany({ where: and(eq(task.workspaceId, ws.id), ne(task.number, 0), isNull(task.parentId)), with: { assignee: { columns: { name: true } } }, orderBy: [desc(task.updatedAt)], limit: 60 });
  const recentDone = tasks.filter((t) => t.status !== "done" || (t.doneAt && t.doneAt >= twoWeeksAgo));
  const prs = await db.query.pullRequest.findMany({ where: and(eq(pullRequest.workspaceId, ws.id), gte(pullRequest.updatedAt, twoWeeksAgo)), with: { task: { columns: { number: true } } }, orderBy: [desc(pullRequest.ghUpdatedAt)], limit: 40 });
  const events = await db
    .select({ body: comment.body, createdAt: comment.createdAt, number: task.number })
    .from(comment)
    .innerJoin(task, eq(task.id, comment.taskId))
    .where(and(eq(task.workspaceId, ws.id), eq(comment.kind, "system"), gte(comment.createdAt, twoWeeksAgo)))
    .orderBy(asc(comment.createdAt))
    .limit(60);
  const docs = await db.query.kbDocument.findMany({ where: and(eq(kbDocument.workspaceId, ws.id), eq(kbDocument.pinned, true), isNull(kbDocument.archivedAt)) });
  const docContents = await Promise.all(
    docs.map(async (d) => {
      const v = await db.query.kbVersion.findFirst({ where: and(eq(kbVersion.documentId, d.id), eq(kbVersion.version, d.currentVersion)) });
      return { title: d.title, kind: d.kind, content: v?.content ?? "" };
    }),
  );
  const previous = await db.query.briefing.findMany({ where: and(eq(briefing.workspaceId, ws.id), eq(briefing.kind, b.kind), eq(briefing.status, "sent")), orderBy: [desc(briefing.sentAt)], limit: 2 });
  const edits = await db.query.briefingEdit.findMany({ where: and(eq(briefingEdit.workspaceId, ws.id), eq(briefingEdit.kind, b.kind)), orderBy: [desc(briefingEdit.createdAt)], limit: 3 });

  let taskCtx = null;
  if (b.taskId) {
    const t = await db.query.task.findFirst({ where: eq(task.id, b.taskId), with: { assignee: { columns: { name: true } }, subtasks: true, pullRequests: true, comments: { with: { author: { columns: { name: true } } }, orderBy: [asc(comment.createdAt)] } } });
    if (t) {
      taskCtx = {
        task: { number: t.number, title: t.title, status: t.status, priority: t.priority, description: t.description, blockedReason: t.blockedReason, updatedAt: t.updatedAt, assignee: t.assignee?.name ?? null },
        comments: t.comments.map((c) => ({ author: c.author?.name ?? null, kind: c.kind, body: c.body, when: c.createdAt })),
        subtasks: t.subtasks.map((s) => ({ number: s.number, title: s.title, status: s.status, priority: s.priority, updatedAt: s.updatedAt })),
        prs: t.pullRequests.map((p) => ({ number: p.number, title: p.title, url: p.url, state: p.state, mergedAt: p.mergedAt, ghUpdatedAt: p.ghUpdatedAt, taskNumber: t.number })),
      };
    }
  }

  const pack = buildBriefingPack({
    kind: b.kind,
    owner: { name: owner.name },
    org: { name: org.name, styleGuide: org.styleGuide },
    workspace: { name: ws.name, clientName: ws.clientName, rules: ws.rules },
    instructions: b.instructions,
    tasks: recentDone.map((t) => ({ number: t.number, title: t.title, status: t.status, priority: t.priority, blockedReason: t.blockedReason, updatedAt: t.updatedAt, assignee: t.assignee?.name ?? null })),
    recentEvents: events.map((e) => ({ when: e.createdAt, text: `T-${e.number}: ${e.body.replace(/\*\*/g, "")}` })),
    prs: prs.map((p) => ({ number: p.number, title: p.title, url: p.url, state: p.state, mergedAt: p.mergedAt, ghUpdatedAt: p.ghUpdatedAt, taskNumber: p.task?.number ?? null })),
    docs: docContents,
    task: taskCtx,
    previous: previous.filter((p) => p.finalText && p.sentAt).map((p) => ({ kind: p.kind, title: p.title, finalText: p.finalText!, sentAt: p.sentAt! })),
    edits: edits.map((e) => ({ draft: e.draft, finalText: e.finalText, when: e.createdAt })),
  });
  return { briefing: b, pack };
}

/** Tool handler: the model hands back the draft. */
export async function submitBriefingDraft(sessionId: string, args: { title: string; body: string; notes?: string }): Promise<string> {
  const b = await briefingForSession(sessionId);
  if (!b) throw new Error("This session is not attached to a briefing.");
  await db.update(briefing).set({ status: "draft", title: args.title.slice(0, 200), draft: args.body, finalText: b.finalText ?? args.body, updatedAt: new Date(), error: null }).where(eq(briefing.id, b.id));
  if (args.notes?.trim()) {
    await db.update(briefing).set({ instructions: b.instructions + `\n\n---\nNotes from the drafting session:\n${args.notes.trim()}` }).where(eq(briefing.id, b.id));
  }
  // Ask the runner to end the session after this turn.
  await db.update(agentSession).set({ endRequestedAt: new Date(), updatedAt: new Date() }).where(eq(agentSession.id, sessionId));
  if (b.taskId) await addSystemComment(b.taskId, `Briefing draft ready: _${args.title}_.`);
  return `Draft saved as "${args.title}". ${b.kind === "status_update" ? "The owner will review and send it." : "The owner will review, edit and send it."} You are done.`;
}

export async function markBriefingFailed(sessionId: string, error: string) {
  const b = await briefingForSession(sessionId);
  if (!b || b.status === "draft" || b.status === "sent") return;
  await db.update(briefing).set({ status: "failed", error, updatedAt: new Date() }).where(eq(briefing.id, b.id));
}

export async function markBriefingDrafting(sessionId: string) {
  const b = await briefingForSession(sessionId);
  if (!b || b.status !== "queued") return;
  await db.update(briefing).set({ status: "drafting", updatedAt: new Date() }).where(eq(briefing.id, b.id));
}

export async function saveFinalText(briefingId: string, finalText: string) {
  await db.update(briefing).set({ finalText, updatedAt: new Date() }).where(eq(briefing.id, briefingId));
}

/** The owner sent it themselves; record the draft→final pair for learning. */
export async function markBriefingSent(briefingId: string, finalText: string, sentVia: string | null) {
  const b = await db.query.briefing.findFirst({ where: eq(briefing.id, briefingId) });
  if (!b) throw new Error("Briefing not found.");
  if (!finalText.trim()) throw new Error("The text to send is empty.");
  await db.update(briefing).set({ status: "sent", finalText, sentAt: new Date(), sentVia, updatedAt: new Date() }).where(eq(briefing.id, b.id));
  if (b.draft && b.draft.trim() !== finalText.trim()) {
    await db.insert(briefingEdit).values({ id: randomUUID(), briefingId: b.id, workspaceId: b.workspaceId, kind: b.kind, draft: b.draft, finalText });
  }
  if (b.taskId) await addSystemComment(b.taskId, `Briefing sent to the client: _${b.title}_${sentVia ? ` (${sentVia})` : ""}.`);
}

export async function discardBriefing(briefingId: string) {
  const b = await db.query.briefing.findFirst({ where: eq(briefing.id, briefingId) });
  if (!b) return;
  await db.update(briefing).set({ status: "discarded", updatedAt: new Date() }).where(eq(briefing.id, b.id));
  if (b.sessionId) {
    await db.update(agentSession).set({ endRequestedAt: new Date(), updatedAt: new Date() }).where(and(eq(agentSession.id, b.sessionId), inArray(agentSession.status, ["queued", "claimed", "starting", "running", "idle"])));
  }
}

/** New drafting session for the same briefing, with optional feedback appended to the instructions. */
export async function regenerateBriefing(briefingId: string, feedback: string, createdBy: string) {
  const b = await db.query.briefing.findFirst({ where: eq(briefing.id, briefingId) });
  if (!b) throw new Error("Briefing not found.");
  const ws = (await db.query.workspace.findFirst({ where: eq(workspace.id, b.workspaceId) }))!;
  const instructions = feedback.trim()
    ? `${b.instructions}\n\n---\nFeedback on the previous draft (apply it):\n${feedback.trim()}${b.draft ? `\n\nPrevious draft:\n${b.draft.slice(0, 4000)}` : ""}`
    : b.instructions;
  const sessionId = await startDraftingSession({ briefingId: b.id, workspaceId: b.workspaceId, taskId: b.taskId, createdBy, model: ws.defaultModel, title: b.title, instructions });
  await db.update(briefing).set({ status: "queued", sessionId, instructions, error: null, updatedAt: new Date() }).where(eq(briefing.id, b.id));
}
