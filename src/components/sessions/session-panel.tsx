import { Bot } from "lucide-react";
import Link from "next/link";
import { TimeAgo } from "@/components/common/time";
import type { AgentSession } from "@/db/schema";
import { NewSessionDialog } from "./new-session-dialog";
import { SessionStatusBadge, fmtUsd } from "./status-badge";

type S = AgentSession & { runner: { name: string; hostname: string | null } | null; creator: { name: string } | null };

export function SessionPanel({
  taskId,
  slug,
  sessions,
  defaultModel,
  repos,
  hasOnlineRunner,
  taskDone,
}: {
  taskId: string;
  slug: string;
  sessions: S[];
  defaultModel: string;
  repos: { id: string; owner: string; name: string }[];
  hasOnlineRunner: boolean;
  taskDone: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Bot className="size-4" /> Claude sessions</h2>
        <div className="flex gap-2">
          <NewSessionDialog taskId={taskId} slug={slug} kind="planning" defaultModel={defaultModel} repos={repos} hasOnlineRunner={hasOnlineRunner} disabled={taskDone} />
          <NewSessionDialog taskId={taskId} slug={slug} kind="implementation" defaultModel={defaultModel} repos={repos} hasOnlineRunner={hasOnlineRunner} disabled={taskDone} />
        </div>
      </div>
      {sessions.length ? (
        <ul className="rounded-lg border divide-y text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="px-3 py-2 hover:bg-accent/40">
              <Link href={`/w/${slug}/sessions/${s.id}`} className="flex items-center gap-2">
                <SessionStatusBadge status={s.status} />
                <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground capitalize">{s.kind}</span>
                <span className="truncate flex-1 font-medium">{s.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{s.costMicros ? fmtUsd(s.costMicros / 1e6) : ""}</span>
                <TimeAgo date={s.updatedAt} className="text-xs text-muted-foreground w-14 text-right" />
              </Link>
              <div className="text-xs text-muted-foreground mt-0.5">
                {s.creator?.name ?? "?"}{s.runner ? ` · ${s.runner.name}` : ""}{s.branch ? ` · ${s.branch}` : ""}{s.error ? ` · ${s.error}` : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No sessions yet. Planning is read-only and produces a plan plus proposals; implementation works on <code className="font-mono">t{"<n>"}-…</code> and opens a PR.
        </p>
      )}
    </section>
  );
}
