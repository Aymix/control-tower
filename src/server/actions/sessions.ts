"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agentSession, task } from "@/db/schema";
import { audit } from "@/server/audit";
import { requireUser, requireWorkspaceById } from "@/server/auth";
import { createSession, queueMessage, requestEnd, requestInterrupt, workspaceSpendMicros } from "@/server/sessions/service";
import { fail, ok, run, type ActionResult } from "./result";

const createSchema = z.object({
  kind: z.enum(["planning", "implementation"]),
  instruction: z.string().trim().min(1).max(20_000),
  model: z.string().trim().max(80).optional(),
  repoId: z.string().optional(),
  maxBudgetUsd: z.coerce.number().positive().max(1000).optional(),
});

export async function createSessionAction(taskId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const me = await requireUser();
    const t = await db.query.task.findFirst({ where: eq(task.id, taskId) });
    if (!t) return fail("Task not found.");
    const ws = await requireWorkspaceById(me, t.workspaceId);
    const input = createSchema.parse({
      kind: formData.get("kind"),
      instruction: formData.get("instruction"),
      model: formData.get("model") || undefined,
      repoId: formData.get("repoId") || undefined,
      maxBudgetUsd: formData.get("maxBudgetUsd") || undefined,
    });
    if (ws.budgetCents != null) {
      const spent = await workspaceSpendMicros(ws.id);
      if (spent >= ws.budgetCents * 10_000) return fail(`This workspace has reached its budget ($${(ws.budgetCents / 100).toFixed(2)}). Raise it in settings to start new sessions.`);
    }
    const s = await createSession({ workspaceId: ws.id, taskId: t.id, kind: input.kind, instruction: input.instruction, model: input.model, repoId: input.repoId, maxBudgetUsd: input.maxBudgetUsd, createdBy: me.id });
    await audit({ actorId: me.id, workspaceId: ws.id, action: "session.created", entityType: "agent_session", entityId: s.id, meta: { kind: s.kind, task: t.number } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok({ id: s.id });
  });
}

async function loadSession(sessionId: string) {
  const me = await requireUser();
  const s = await db.query.agentSession.findFirst({ where: eq(agentSession.id, sessionId) });
  if (!s) throw new Error("Session not found.");
  const ws = await requireWorkspaceById(me, s.workspaceId);
  return { me, s, ws };
}

export async function sendSessionMessage(sessionId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const { me, s, ws } = await loadSession(sessionId);
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return fail("Message cannot be empty.");
    const kind = s.status === "running" || s.status === "starting" || s.status === "claimed" ? "steer" : "followup";
    await queueMessage(s.id, kind, body, me.id);
    revalidatePath(`/w/${ws.slug}/sessions/${s.id}`);
    return ok();
  });
}

export async function interruptSession(sessionId: string): Promise<ActionResult> {
  return run(async () => {
    const { me, s, ws } = await loadSession(sessionId);
    await requestInterrupt(s.id);
    await audit({ actorId: me.id, workspaceId: ws.id, action: "session.interrupt", entityType: "agent_session", entityId: s.id });
    revalidatePath(`/w/${ws.slug}/sessions/${s.id}`);
    return ok();
  });
}

export async function endSession(sessionId: string): Promise<ActionResult> {
  return run(async () => {
    const { me, s, ws } = await loadSession(sessionId);
    await requestEnd(s.id);
    await audit({ actorId: me.id, workspaceId: ws.id, action: "session.end", entityType: "agent_session", entityId: s.id });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}
