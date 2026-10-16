import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefingEditor } from "@/components/briefings/briefing-editor";
import { BriefingStatusBadge } from "@/components/briefings/status-badge";
import { Markdown } from "@/components/common/markdown";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { briefing } from "@/db/schema";
import { KIND_LABEL } from "@/lib/briefings/pack";
import { requireOwner, requireWorkspace } from "@/server/auth";

export default async function BriefingPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await requireOwner();
  const ws = await requireWorkspace(me, slug);
  const b = await db.query.briefing.findFirst({ where: and(eq(briefing.id, id), eq(briefing.workspaceId, ws.id)), with: { task: { columns: { number: true, title: true } }, session: { columns: { id: true, status: true, costMicros: true } } } });
  if (!b) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow={<span><Link href={`/w/${slug}/briefings`} className="hover:underline">Briefings</Link> · {KIND_LABEL[b.kind]}{b.task ? <> · <Link href={`/w/${slug}/tasks/${b.task.number}`} className="hover:underline">T-{b.task.number} {b.task.title}</Link></> : null}</span>}
        title={<span className="flex items-center gap-2"><BriefingStatusBadge status={b.status} /> {b.title}</span>}
        description={
          <span className="flex flex-wrap gap-x-3">
            {b.session ? <Link href={`/w/${slug}/sessions/${b.session.id}`} className="underline">drafting session ({b.session.status}{b.session.costMicros ? `, $${(b.session.costMicros / 1e6).toFixed(2)}` : ""})</Link> : null}
            <span>created {b.createdAt.toLocaleString()}</span>
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <BriefingEditor briefing={b} />
        <aside className="space-y-4 text-sm">
          {b.instructions.trim() ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Instructions & notes</div>
              <div className="rounded-lg border p-3 text-[13px]"><Markdown>{b.instructions}</Markdown></div>
            </div>
          ) : null}
          {b.status === "sent" && b.draft && b.draft.trim() !== (b.finalText ?? "").trim() ? (
            <details>
              <summary className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer">Original draft</summary>
              <div className="rounded-lg border p-3 mt-1 text-[13px] opacity-80"><Markdown>{b.draft}</Markdown></div>
            </details>
          ) : null}
          <p className="text-xs text-muted-foreground">Nothing is ever sent automatically. Copy the text into your email or chat, then mark it sent so the next draft learns from your edits.</p>
        </aside>
      </div>
    </div>
  );
}
