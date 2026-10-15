"use client";
import { GitPullRequest, Lock } from "lucide-react";
import Link from "next/link";
import { PriorityBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";
import type { BoardCard } from "./types";

export function TaskCard({ card, slug, dragging }: { card: BoardCard; slug: string; dragging?: boolean }) {
  const initials = card.assignee?.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const openPrs = card.prs.filter((p) => p.state === "open");
  const ci = openPrs.some((p) => p.ciStatus === "failure") ? "failure" : openPrs.some((p) => p.ciStatus === "pending") ? "pending" : openPrs.some((p) => p.ciStatus === "success") ? "success" : "none";
  return (
    <div className={cn("rounded-md border bg-card p-2.5 text-sm shadow-xs hover:border-foreground/30 transition-colors", dragging && "shadow-lg rotate-[0.5deg]")}>
      <div className="flex items-start gap-2">
        <Link href={`/w/${slug}/tasks/${card.number}`} className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
            T-{card.number}
            {card.parent ? <span className="truncate">↳ T-{card.parent.number}</span> : null}
          </div>
          <div className="font-medium leading-5 line-clamp-3 hover:underline">{card.title}</div>
        </Link>
        {card.assignee ? (
          <span title={card.assignee.name} className="size-6 shrink-0 rounded-full bg-muted grid place-items-center text-[10px] font-medium">
            {initials}
          </span>
        ) : null}
      </div>
      {card.status === "blocked" && card.blockedReason ? (
        <div className="mt-1.5 text-xs text-red-700 dark:text-red-300 line-clamp-2">
          <Lock className="inline size-3 mr-1 -mt-0.5" />
          {card.blockedReason}
        </div>
      ) : null}
      {card.blockedBy.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.blockedBy.map((b) => (
            <Link
              key={b.id}
              href={`/w/${slug}/tasks/${b.number}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "text-[10px] rounded border px-1 py-px font-mono",
                b.status === "done" ? "text-muted-foreground line-through" : "text-red-700 dark:text-red-300 border-red-500/30",
              )}
              title={`Blocked by T-${b.number}: ${b.title}`}
            >
              ⛔ T-{b.number}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <PriorityBadge priority={card.priority} />
        {card.subtasks.total ? (
          <span className={cn(card.subtasks.done === card.subtasks.total && "text-emerald-600 dark:text-emerald-400")}>
            {card.subtasks.done}/{card.subtasks.total}
          </span>
        ) : null}
        {card.prs.length ? (
          <span className="inline-flex items-center gap-0.5">
            <GitPullRequest
              className={cn(
                "size-3",
                ci === "failure" && "text-red-500",
                ci === "pending" && "text-amber-500",
                ci === "success" && "text-emerald-500",
                card.prs.every((p) => p.state === "merged") && "text-purple-500",
              )}
            />
            {card.prs.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}
