import type { PullRequest } from "@/db/schema";

export type PollPriority = "hot" | "warm" | "cold";

export type PriorityConfig = { hotSeconds: number; warmSeconds: number; coldSeconds: number };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * hot  — open PR with activity in the last 2 hours, or a linked task in review
 * warm — open PR without recent activity
 * cold — merged/closed PR (polled rarely, only to catch re-opens) or stale > 14 days
 */
export function computePriority(
  pr: Pick<PullRequest, "state" | "ghUpdatedAt" | "createdAt"> & { taskStatus?: string | null },
  now = new Date(),
): PollPriority {
  if (pr.state !== "open") return "cold";
  const updated = pr.ghUpdatedAt ?? pr.createdAt;
  const age = now.getTime() - updated.getTime();
  if (pr.taskStatus === "in_review") return "hot";
  if (age <= 2 * HOUR) return "hot";
  if (age > 14 * DAY) return "cold";
  return "warm";
}

export function intervalFor(priority: PollPriority, cfg: PriorityConfig): number {
  switch (priority) {
    case "hot":
      return cfg.hotSeconds * 1000;
    case "warm":
      return cfg.warmSeconds * 1000;
    case "cold":
      return cfg.coldSeconds * 1000;
  }
}

export function isDue(
  pr: Pick<PullRequest, "pollPriority" | "lastPolledAt">,
  cfg: PriorityConfig,
  now = new Date(),
): boolean {
  if (!pr.lastPolledAt) return true;
  return now.getTime() - pr.lastPolledAt.getTime() >= intervalFor(pr.pollPriority, cfg);
}
