import { and, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeAgo } from "@/components/common/time";
import { SessionView } from "@/components/sessions/session-controls";
import { SessionStatusBadge, fmtUsd } from "@/components/sessions/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { agentSession } from "@/db/schema";
import { requireUser, requireWorkspace } from "@/server/auth";
import { listSessionEvents } from "@/server/sessions/service";

export default async function SessionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const s = await db.query.agentSession.findFirst({
    where: and(eq(agentSession.id, id), eq(agentSession.workspaceId, ws.id)),
    with: { task: { columns: { number: true, title: true } }, runner: { columns: { name: true, hostname: true } }, creator: { columns: { name: true } }, pullRequest: { columns: { id: true, number: true, url: true, state: true } }, repo: true },
  });
  if (!s) notFound();
  const events = await listSessionEvents(s.id, 0, 2000);
  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow={
          <span>
            <Link href={`/w/${slug}/sessions`} className="hover:underline">Sessions</Link> · <Link href={`/w/${slug}/tasks/${s.task.number}`} className="hover:underline">T-{s.task.number} {s.task.title}</Link>
          </span>
        }
        title={
          <span className="flex items-center gap-2">
            <SessionStatusBadge status={s.status} /> <span className="capitalize">{s.kind}</span>: {s.title}
          </span>
        }
        description={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{s.creator?.name}</span>
            {s.runner ? <span>runner {s.runner.name}{s.runner.hostname ? ` (${s.runner.hostname})` : ""}</span> : <span>no runner yet</span>}
            <span>model {s.model}</span>
            {s.repo ? <span>{s.repo.owner}/{s.repo.name}{s.branch ? ` · ${s.branch}` : ""}</span> : null}
            {s.maxBudgetUsd != null ? <span>budget {fmtUsd(s.maxBudgetUsd / 100)}</span> : null}
            <span>created <TimeAgo date={s.createdAt} /></span>
            {s.hasUnpushedCommits ? <span className="text-amber-600 dark:text-amber-400">unpushed commits kept in {s.worktreePath}</span> : null}
            {s.pullRequest ? (
              <Link href={`/w/${slug}/prs/${s.pullRequest.id}`} className="underline inline-flex items-center gap-1">PR #{s.pullRequest.number} ({s.pullRequest.state}) <ExternalLink className="size-3" /></Link>
            ) : null}
          </span>
        }
      />
      <SessionView
        sessionId={s.id}
        initialEvents={events.map((e) => ({ seq: e.seq, type: e.type, payload: e.payload, createdAt: e.createdAt.toISOString() }))}
        initialStatus={{ status: s.status, costUsd: s.costMicros / 1e6, error: s.error, attached: s.attached, pullRequestId: s.pullRequestId, hasUnpushedCommits: s.hasUnpushedCommits, inputTokens: s.inputTokens, outputTokens: s.outputTokens, numTurns: s.numTurns }}
      />
    </div>
  );
}
