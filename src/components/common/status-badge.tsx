import type { TaskPriority, TaskStatus } from "@/db/schema";
import { STATUS_LABEL } from "@/lib/tasks/transitions";
import { cn } from "@/lib/utils";

const statusStyles: Record<TaskStatus, string> = {
  backlog: "bg-muted text-muted-foreground border-transparent",
  in_progress: "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/20",
  blocked: "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/20",
  in_review: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/20",
  done: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", statusStyles[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const prioStyles: Record<TaskPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground/70",
  high: "text-orange-600 dark:text-orange-400",
  urgent: "text-red-600 dark:text-red-400 font-semibold",
};
const prioLabel: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  return <span className={cn("text-[11px] font-medium", prioStyles[priority], className)}>{prioLabel[priority]}</span>;
}

export function PrStateBadge({ state, draft }: { state: "open" | "closed" | "merged"; draft?: boolean }) {
  const cls =
    state === "merged"
      ? "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/20"
      : state === "closed"
        ? "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/20"
        : draft
          ? "bg-muted text-muted-foreground border-transparent"
          : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", cls)}>
      {state === "open" && draft ? "Draft" : state[0].toUpperCase() + state.slice(1)}
    </span>
  );
}

export function CiBadge({ status }: { status: "none" | "pending" | "success" | "failure" }) {
  if (status === "none") return <span className="text-[11px] text-muted-foreground">No CI</span>;
  const cls =
    status === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "failure"
        ? "text-red-600 dark:text-red-400"
        : "text-amber-600 dark:text-amber-400";
  const label = status === "success" ? "CI passing" : status === "failure" ? "CI failing" : "CI running";
  return <span className={cn("text-[11px] font-medium", cls)}>{label}</span>;
}
