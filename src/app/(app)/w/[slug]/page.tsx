import { and, desc, eq, ne } from "drizzle-orm";
import { BookOpen, GitPullRequest, ListTodo, Pin } from "lucide-react";
import Link from "next/link";
import { Markdown } from "@/components/common/markdown";
import { PrStateBadge, StatusBadge } from "@/components/common/status-badge";
import { TimeAgo } from "@/components/common/time";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { comment, kbDocument, proposal, pullRequest, task } from "@/db/schema";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/tasks/transitions";
import { requireUser, requireWorkspace } from "@/server/auth";

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const [tasks, openPrs, pinned, pendingProposals, recent] = await Promise.all([
    db.query.task.findMany({ where: eq(task.workspaceId, ws.id), columns: { id: true, status: true, number: true, title: true, updatedAt: true, blockedReason: true } }),
    db.query.pullRequest.findMany({ where: and(eq(pullRequest.workspaceId, ws.id), eq(pullRequest.state, "open")), with: { repo: true, task: { columns: { number: true } } }, orderBy: [desc(pullRequest.ghUpdatedAt)], limit: 8 }),
    db.query.kbDocument.findMany({ where: and(eq(kbDocument.workspaceId, ws.id), eq(kbDocument.pinned, true)), orderBy: [desc(kbDocument.updatedAt)] }),
    db.query.proposal.findMany({ where: and(eq(proposal.workspaceId, ws.id), eq(proposal.status, "pending")), columns: { id: true } }),
    db
      .select({ c: comment, t: { number: task.number, title: task.title } })
      .from(comment)
      .innerJoin(task, eq(task.id, comment.taskId))
      .where(and(eq(task.workspaceId, ws.id), ne(comment.kind, "system")))
      .orderBy(desc(comment.createdAt))
      .limit(10),
  ]);
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, tasks.filter((t) => t.status === s).length]));
  const attention = tasks.filter((t) => t.status === "blocked" || t.status === "in_review").sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 8);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Overview"
        description={`${ws.clientName} · default model ${ws.defaultModel}${ws.budgetCents != null ? ` · budget $${(ws.budgetCents / 100).toLocaleString()}` : ""}`}
      />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mb-6">
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={`/w/${slug}/board`} className="rounded-lg border p-3 hover:bg-accent/40">
            <div className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</div>
            <div className="text-2xl font-semibold tabular-nums">{counts[s]}</div>
          </Link>
        ))}
      </div>
      {pendingProposals.length ? (
        <Link href={`/w/${slug}/proposals`} className="block rounded-lg border bg-violet-500/5 border-violet-500/30 px-3 py-2 text-sm mb-6 hover:bg-violet-500/10">
          <strong>{pendingProposals.length}</strong> proposal{pendingProposals.length > 1 ? "s" : ""} waiting for your decision →
        </Link>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2"><ListTodo className="size-4" /> Needs attention</h2>
          {attention.length ? (
            <ul className="rounded-lg border divide-y text-sm">
              {attention.map((t) => (
                <li key={t.id} className="px-3 py-2">
                  <Link href={`/w/${slug}/tasks/${t.number}`} className="flex items-center gap-2 hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">T-{t.number}</span>
                    <span className="truncate flex-1">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </Link>
                  {t.blockedReason ? <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.blockedReason}</div> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing blocked or in review.</p>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2"><GitPullRequest className="size-4" /> Open PRs</h2>
          {openPrs.length ? (
            <ul className="rounded-lg border divide-y text-sm">
              {openPrs.map((pr) => (
                <li key={pr.id} className="px-3 py-2">
                  <Link href={`/w/${slug}/prs/${pr.id}`} className="flex items-center gap-2 hover:underline">
                    <PrStateBadge state={pr.state} draft={pr.draft} />
                    <span className="truncate flex-1">{pr.title}</span>
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {pr.repo.name}#{pr.number}{pr.task ? ` · T-${pr.task.number}` : ""} · {pr.ciStatus === "none" ? "no CI" : `CI ${pr.ciStatus}`} · <TimeAgo date={pr.ghUpdatedAt} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open pull requests.</p>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Pin className="size-4" /> Pinned knowledge</h2>
          {pinned.length ? (
            <ul className="rounded-lg border divide-y text-sm">
              {pinned.map((d) => (
                <li key={d.id} className="px-3 py-2">
                  <Link href={`/w/${slug}/knowledge/${d.id}`} className="flex items-center gap-2 hover:underline">
                    <BookOpen className="size-3.5 text-muted-foreground" />
                    <span className="truncate flex-1">{d.title}</span>
                    <span className="text-[11px] text-muted-foreground">{d.kind.replace("_", " ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Pin scope, architecture or decision docs so they are always in Claude&apos;s context.</p>
          )}
        </section>
      </div>
      <section className="mt-8 space-y-2">
        <h2 className="text-sm font-semibold">Recent discussion</h2>
        {recent.length ? (
          <ul className="space-y-3 max-w-3xl">
            {recent.map(({ c, t }) => (
              <li key={c.id} className="text-sm">
                <Link href={`/w/${slug}/tasks/${t.number}`} className="text-xs text-muted-foreground hover:text-foreground">
                  T-{t.number} {t.title} · <TimeAgo date={c.createdAt} />
                </Link>
                <div className="line-clamp-3"><Markdown>{c.body}</Markdown></div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
      </section>
    </div>
  );
}
