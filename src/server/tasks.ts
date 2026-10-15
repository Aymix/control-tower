import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comment, task, workspace, type Task, type TaskPriority } from "@/db/schema";

/** Allocates the next T-n number for a workspace atomically. */
export async function nextTaskNumber(workspaceId: string): Promise<number> {
  const [row] = await db
    .update(workspace)
    .set({ taskCounter: sql`${workspace.taskCounter} + 1` })
    .where(eq(workspace.id, workspaceId))
    .returning({ n: workspace.taskCounter });
  return row.n;
}

export async function createTaskRecord(input: {
  workspaceId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigneeId?: string | null;
  parentId?: string | null;
  createdBy: string;
}): Promise<Task> {
  const number = await nextTaskNumber(input.workspaceId);
  const [maxPos] = await db
    .select({ m: sql<number>`coalesce(max(${task.position}), 0)` })
    .from(task)
    .where(and(eq(task.workspaceId, input.workspaceId), eq(task.status, "backlog")));
  const [t] = await db
    .insert(task)
    .values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      number,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority ?? "medium",
      assigneeId: input.assigneeId ?? null,
      parentId: input.parentId ?? null,
      position: (maxPos?.m ?? 0) + 1,
      createdBy: input.createdBy,
    })
    .returning();
  return t;
}

export async function addSystemComment(taskId: string, body: string) {
  await db.insert(comment).values({ id: randomUUID(), taskId, kind: "system", body });
}

export async function addAgentComment(taskId: string, body: string) {
  await db.insert(comment).values({ id: randomUUID(), taskId, kind: "agent", body });
}
