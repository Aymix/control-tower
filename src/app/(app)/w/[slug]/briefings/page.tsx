import { and, desc, eq, ne } from "drizzle-orm";
import { Megaphone } from "lucide-react";
import Link from "next/link";
import { BriefingStatusBadge } from "@/components/briefings/status-badge";
import { NewBriefingDialog } from "@/components/briefings/new-briefing-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/time";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { briefing, runnerToken, task } from "@/db/schema";
import { KIND_LABEL } from "@/lib/briefings/pack";
import { requireUser, requireWorkspace } from "@/server/auth";
import { runnerIsOnline } from "@/server/runner-auth";

export const metadata = { title: "Briefings" };

export default async function BriefingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  if (me.role !== "owner") {
    return (
      <div className="max-w-4xl">
        <PageHeader title="Briefings" description="Client communication is written and sent by the owner." />
        <EmptyState icon={Megaphone} title="Owner only" description="Briefings are drafted in the owner's voice and sent by the owner. If the client needs something, add a comment on the task or mark it Blocked." />
      </div>
    );
  }
  const [items, tasks, runners] = await Promise.all([
    db.query.briefing.findMany({ where: eq(briefing.workspaceId, ws.id), orderBy: [desc(briefing.createdAt)], with: { task: { columns: { number: true, title: true } } }, limit: 200 }),
    db.query.task.findMany({ where: and(eq(task.workspaceId, ws.id), ne(task.number, 0), ne(task.status, "done")), columns: { id: true, number: true, title: true }, orderBy: [desc(task.number)] }),
    db.query.runnerToken.findMany({ where: eq(runnerToken.userId, me.id) }),
  ]);
  const review = items.filter((b) => b.status === "draft" || b.status === "drafting" || b.status === "queued" || b.status === "failed");
  const done = items.filter((b) => b.status === "sent" || b.status === "discarded");
  const list = (rows: typeof items) => (
    <ul className="rounded-lg border divide-y text-sm">
      {rows.map((b) => (
        <li key={b.id} className="px-3 py-2 hover:bg-accent/40">
          <Link href={`/w/${slug}/briefings/${b.id}`} className="flex items-center gap-2">
            <BriefingStatusBadge status={b.status} />
            <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground">{KIND_LABEL[b.kind]}</span>
            <span className="truncate flex-1 font-medium">{b.title}</span>
            <TimeAgo date={b.sentAt ?? b.updatedAt} className="text-xs text-muted-foreground w-14 text-right" />
          </Link>
          {b.task ? <div className="text-xs text-muted-foreground mt-0.5">T-{b.task.number} {b.task.title}</div> : null}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Briefings"
        description="Status updates, pre-task questions, blockers and release notes drafted in your voice. You review, edit and send them yourself; your edits teach the next drafts."
        actions={<NewBriefingDialog workspaceId={ws.id} slug={slug} tasks={tasks} hasOnlineRunner={runners.some((r) => runnerIsOnline(r))} />}
      />
      {items.length === 0 ? (
        <EmptyState icon={Megaphone} title="No briefings yet" description="Start with a status update. Fill in the style guide under Settings first so the draft sounds like you." />
      ) : (
        <>
          {review.length ? <section className="space-y-2"><h2 className="text-sm font-semibold">To review ({review.length})</h2>{list(review)}</section> : null}
          {done.length ? <section className="space-y-2"><h2 className="text-sm font-semibold">Sent & discarded</h2>{list(done)}</section> : null}
        </>
      )}
    </div>
  );
}
