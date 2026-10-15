import { desc, eq } from "drizzle-orm";
import { Bot } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/time";
import { SessionStatusBadge, fmtUsd } from "@/components/sessions/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { agentSession } from "@/db/schema";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Sessions" };

export default async function SessionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const sessions = await db.query.agentSession.findMany({
    where: eq(agentSession.workspaceId, ws.id),
    orderBy: [desc(agentSession.createdAt)],
    limit: 200,
    with: { task: { columns: { number: true, title: true } }, runner: { columns: { name: true } }, creator: { columns: { name: true } } },
  });
  return (
    <div className="max-w-5xl">
      <PageHeader title="Claude sessions" description="Every planning and implementation session in this workspace. Start one from a task page." />
      {sessions.length === 0 ? (
        <EmptyState icon={Bot} title="No sessions yet" description="Open a task and click “Plan with Claude” or “Implement with Claude”. Sessions run on your own runner." />
      ) : (
        <ul className="rounded-lg border divide-y text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="px-3 py-2 hover:bg-accent/40">
              <Link href={`/w/${slug}/sessions/${s.id}`} className="flex items-center gap-2">
                <SessionStatusBadge status={s.status} />
                <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground capitalize">{s.kind}</span>
                <span className="font-mono text-xs text-muted-foreground">T-{s.task.number}</span>
                <span className="truncate flex-1 font-medium">{s.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{s.costMicros ? fmtUsd(s.costMicros / 1e6) : ""}</span>
                <TimeAgo date={s.updatedAt} className="text-xs text-muted-foreground w-14 text-right" />
              </Link>
              <div className="text-xs text-muted-foreground mt-0.5">{s.creator?.name}{s.runner ? ` · ${s.runner.name}` : ""}{s.error ? ` · ${s.error}` : ""}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
