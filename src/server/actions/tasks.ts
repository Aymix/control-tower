"use server";
import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { TASK_PRIORITIES, TASK_STATUSES, comment, task, taskBlocker, user } from "@/db/schema";
import { checkTransition, systemCommentForTransition } from "@/lib/tasks/transitions";
import { audit } from "@/server/audit";
import { requireUser, requireWorkspaceById, type CurrentUser } from "@/server/auth";
import { addSystemComment, createTaskRecord } from "@/server/tasks";
import { fail, ok, run, type ActionResult } from "./result";

async function loadTask(me: CurrentUser, taskId: string) {
  const t = await db.query.task.findFirst({ where: eq(task.id, taskId) });
  if (!t) throw new Error("Task not found.");
  const ws = await requireWorkspaceById(me, t.workspaceId);
  return { t, ws };
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50_000).optional().default(""),
  priority: z.enum(TASK_PRIORITIES).optional().default("medium"),
  assigneeId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
});

export async function createTask(workspaceId: string, formData: FormData): Promise<ActionResult<{ id: string; number: number }>> {
  return run(async () => {
    const me = await requireUser();
    const ws = await requireWorkspaceById(me, workspaceId);
    const input = createSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      priority: formData.get("priority") || "medium",
      assigneeId: formData.get("assigneeId") || null,
      parentId: formData.get("parentId") || null,
    });
    if (input.parentId) {
      const parent = await db.query.task.findFirst({ where: and(eq(task.id, input.parentId), eq(task.workspaceId, ws.id)) });
      if (!parent) return fail("Parent task not found.");
      if (parent.parentId) return fail("Subtasks cannot have their own subtasks (one level only).");
    }
    const t = await createTaskRecord({ ...input, workspaceId: ws.id, createdBy: me.id });
    await audit({ actorId: me.id, workspaceId: ws.id, action: "task.created", entityType: "task", entityId: t.id, meta: { number: t.number } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    revalidatePath("/inbox");
    return ok({ id: t.id, number: t.number });
  });
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50_000),
  priority: z.enum(TASK_PRIORITIES),
  assigneeId: z.string().nullable(),
});

export async function updateTask(taskId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { t, ws } = await loadTask(me, taskId);
    const input = updateSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      priority: formData.get("priority") ?? t.priority,
      assigneeId: formData.get("assigneeId") || null,
    });
    if (input.assigneeId) {
      const u = await db.query.user.findFirst({ where: eq(user.id, input.assigneeId) });
      if (!u) return fail("Unknown assignee.");
    }
    await db.update(task).set({ ...input, updatedAt: new Date() }).where(eq(task.id, t.id));
    if (input.assigneeId !== t.assigneeId) {
      const who = input.assigneeId ? (await db.query.user.findFirst({ where: eq(user.id, input.assigneeId) }))?.name : null;
      await addSystemComment(t.id, who ? `**${me.name}** assigned this task to **${who}**.` : `**${me.name}** unassigned this task.`);
    }
    await audit({ actorId: me.id, workspaceId: ws.id, action: "task.updated", entityType: "task", entityId: t.id });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

const moveSchema = z.object({
  status: z.enum(TASK_STATUSES),
  blockedReason: z.string().max(2000).optional().nullable(),
  position: z.number().int().min(0).optional(),
});

export async function moveTask(taskId: string, input: z.input<typeof moveSchema>): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { t, ws } = await loadTask(me, taskId);
    const parsed = moveSchema.parse(input);
    const check = checkTransition({ from: t.status, to: parsed.status, role: me.role, blockedReason: parsed.blockedReason });
    if (!check.ok) return fail(check.reason);

    const patch: Partial<typeof task.$inferInsert> = { updatedAt: new Date() };
    if (parsed.position !== undefined) patch.position = parsed.position;
    if (parsed.status !== t.status) {
      patch.status = parsed.status;
      patch.blockedReason = parsed.status === "blocked" ? parsed.blockedReason?.trim() : null;
      patch.doneAt = parsed.status === "done" ? new Date() : null;
    }
    await db.update(task).set(patch).where(eq(task.id, t.id));
    if (parsed.status !== t.status) {
      await addSystemComment(t.id, systemCommentForTransition(t.status, parsed.status, me.name, parsed.blockedReason));
      await audit({ actorId: me.id, workspaceId: ws.id, action: "task.moved", entityType: "task", entityId: t.id, meta: { from: t.status, to: parsed.status } });
    }
    revalidatePath(`/w/${ws.slug}`, "layout");
    revalidatePath("/inbox");
    return ok();
  });
}

export async function addComment(taskId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { t, ws } = await loadTask(me, taskId);
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return fail("Comment cannot be empty.");
    if (body.length > 20_000) return fail("Comment is too long.");
    await db.insert(comment).values({ id: randomUUID(), taskId: t.id, kind: "user", authorId: me.id, body });
    await db.update(task).set({ updatedAt: new Date() }).where(eq(task.id, t.id));
    revalidatePath(`/w/${ws.slug}/tasks/${t.number}`);
    revalidatePath("/inbox");
    return ok();
  });
}

export async function addBlocker(taskId: string, blockedByNumber: number): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { t, ws } = await loadTask(me, taskId);
    const other = await db.query.task.findFirst({ where: and(eq(task.workspaceId, ws.id), eq(task.number, blockedByNumber), ne(task.id, t.id)) });
    if (!other) return fail(`T-${blockedByNumber} not found in this workspace.`);
    await db.insert(taskBlocker).values({ taskId: t.id, blockedById: other.id }).onConflictDoNothing();
    await addSystemComment(t.id, `**${me.name}** marked this task as blocked by T-${other.number} (${other.title}).`);
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

export async function removeBlocker(taskId: string, blockedById: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { t, ws } = await loadTask(me, taskId);
    await db.delete(taskBlocker).where(and(eq(taskBlocker.taskId, t.id), eq(taskBlocker.blockedById, blockedById)));
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    if (me.role !== "owner") return fail("Only the owner can delete tasks.");
    const { t, ws } = await loadTask(me, taskId);
    await db.update(task).set({ parentId: null }).where(eq(task.parentId, t.id));
    await db.delete(task).where(eq(task.id, t.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "task.deleted", entityType: "task", entityId: t.id, meta: { number: t.number } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

/** Persists the card order of one column after a drag. */
export async function reorderColumn(workspaceId: string, orderedIds: string[]): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const ws = await requireWorkspaceById(me, workspaceId);
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(task).set({ position: i }).where(and(eq(task.id, orderedIds[i]), eq(task.workspaceId, ws.id)));
      }
    });
    return ok();
  });
}
