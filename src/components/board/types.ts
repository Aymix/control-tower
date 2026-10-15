import type { TaskPriority, TaskStatus } from "@/db/schema";

export type BoardCard = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  blockedReason: string | null;
  assignee: { id: string; name: string } | null;
  parent: { id: string; number: number; title: string } | null;
  subtasks: { total: number; done: number };
  blockedBy: { id: string; number: number; title: string; status: TaskStatus }[];
  prs: { id: string; state: "open" | "closed" | "merged"; ciStatus: "none" | "pending" | "success" | "failure"; draft: boolean }[];
  updatedAt: string;
};
