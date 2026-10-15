import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { task, taskBlocker, user, workspaceMember } from "@/db/schema";
import type { BoardCard } from "@/components/board/types";

export async function loadBoard(workspaceId: string): Promise<BoardCard[]> {
  const tasks = await db.query.task.findMany({
    where: eq(task.workspaceId, workspaceId),
    with: {
      assignee: { columns: { id: true, name: true } },
      pullRequests: { columns: { id: true, state: true, ciStatus: true, draft: true } },
    },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = tasks.map((t) => t.id);
  const blockers = ids.length ? await db.query.taskBlocker.findMany({ where: inArray(taskBlocker.taskId, ids) }) : [];
  return tasks.map((t) => {
    const subs = tasks.filter((s) => s.parentId === t.id);
    const parent = t.parentId ? byId.get(t.parentId) : null;
    return {
      id: t.id,
      number: t.number,
      title: t.title,
      status: t.status,
      priority: t.priority,
      position: t.position,
      blockedReason: t.blockedReason,
      assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
      parent: parent ? { id: parent.id, number: parent.number, title: parent.title } : null,
      subtasks: { total: subs.length, done: subs.filter((s) => s.status === "done").length },
      blockedBy: blockers
        .filter((b) => b.taskId === t.id)
        .map((b) => byId.get(b.blockedById))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((b) => ({ id: b.id, number: b.number, title: b.title, status: b.status })),
      prs: t.pullRequests.map((p) => ({ id: p.id, state: p.state, ciStatus: p.ciStatus, draft: p.draft })),
      updatedAt: t.updatedAt.toISOString(),
    };
  });
}

/** Members who can be assigned: workspace members plus the owner. */
export async function loadAssignees(workspaceId: string) {
  const owner = await db.query.user.findMany({ where: eq(user.role, "owner"), columns: { id: true, name: true } });
  const members = await db
    .select({ id: user.id, name: user.name })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(eq(workspaceMember.workspaceId, workspaceId));
  const seen = new Set<string>();
  return [...owner, ...members].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.name.localeCompare(b.name));
}
