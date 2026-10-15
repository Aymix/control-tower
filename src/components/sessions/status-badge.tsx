import type { SessionStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

const styles: Record<SessionStatus, string> = {
  queued: "bg-muted text-muted-foreground border-transparent",
  claimed: "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/20",
  starting: "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/20",
  running: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/20",
  idle: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/20",
  completed: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  failed: "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/20",
  interrupted: "bg-orange-500/12 text-orange-700 dark:text-orange-300 border-orange-500/20",
  budget_reached: "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/20",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  queued: "Queued",
  claimed: "Claimed",
  starting: "Starting",
  running: "Running",
  idle: "Idle",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
  budget_reached: "Budget reached",
};

export function SessionStatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", styles[status], className)}>
      {status === "running" ? <span className="size-1.5 rounded-full bg-current animate-pulse" /> : null}
      {SESSION_STATUS_LABEL[status]}
    </span>
  );
}

export const fmtUsd = (usd: number) => (usd < 0.01 && usd > 0 ? "<$0.01" : `$${usd.toFixed(2)}`);
export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
