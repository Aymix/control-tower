import type { TaskStatus } from "@/db/schema";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  blocked: "Blocked",
  in_review: "In review",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = ["backlog", "in_progress", "blocked", "in_review", "done"];

export type Role = "owner" | "dev";

export type TransitionInput = {
  from: TaskStatus;
  to: TaskStatus;
  role: Role;
  blockedReason?: string | null;
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

/**
 * Rules:
 *  - Any role may move between Backlog / In progress / Blocked / In review.
 *  - Blocked requires a non-empty reason.
 *  - Only the owner moves In review → Done (and Done is only reachable from In review).
 *  - Only the owner reopens a Done task (Done → anything).
 */
export function checkTransition(input: TransitionInput): TransitionResult {
  const { from, to, role } = input;
  if (from === to) return { ok: true };
  if (to === "blocked" && !(input.blockedReason ?? "").trim()) {
    return { ok: false, reason: "Blocking a task requires a reason." };
  }
  if (to === "done") {
    if (from !== "in_review") return { ok: false, reason: "Only tasks in review can be marked Done." };
    if (role !== "owner") return { ok: false, reason: "Only the owner can approve Done." };
  }
  if (from === "done" && role !== "owner") {
    return { ok: false, reason: "Only the owner can reopen a Done task." };
  }
  return { ok: true };
}

export function systemCommentForTransition(from: TaskStatus, to: TaskStatus, actor: string, reason?: string | null) {
  const base = `**${actor}** moved this task from **${STATUS_LABEL[from]}** to **${STATUS_LABEL[to]}**.`;
  if (to === "blocked" && reason) return `${base}\n\nBlocked: ${reason.trim()}`;
  return base;
}

export function subtaskProgress(subtasks: { status: TaskStatus }[]) {
  const total = subtasks.length;
  const done = subtasks.filter((s) => s.status === "done").length;
  return { total, done, label: total ? `${done}/${total}` : null };
}
