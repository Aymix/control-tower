import { and, asc, desc, eq, ne } from "drizzle-orm";
import { Lightbulb } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Markdown } from "@/components/common/markdown";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { ProposalCard } from "@/components/proposals/proposal-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/db";
import { proposal, proposalBatch, task } from "@/db/schema";
import { acceptAllPending, createManualBatch } from "@/server/actions/proposals";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Proposals" };

export default async function ProposalsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const batches = await db.query.proposalBatch.findMany({
    where: eq(proposalBatch.workspaceId, ws.id),
    with: { proposals: { orderBy: [asc(proposal.position)], with: { resultingTask: { columns: { number: true } } } }, sourceTask: { columns: { id: true, number: true, title: true, parentId: true } } },
    orderBy: [desc(proposalBatch.createdAt)],
  });
  const tasks = await db.query.task.findMany({ where: and(eq(task.workspaceId, ws.id), ne(task.number, 0)), columns: { id: true, number: true, title: true }, orderBy: [desc(task.number)], limit: 200 });
  const isOwner = me.role === "owner";

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Proposals"
        description="Work detected from planning sessions and task breakdowns. Accept, edit, merge into an existing task, or discard. Adding tasks manually on the board stays the default."
      />
      {batches.length === 0 ? (
        <EmptyState icon={Lightbulb} title="No proposals yet" description="Planning sessions (phase 2) will propose tasks here. You can also break a task down manually below." className="mb-8" />
      ) : (
        <div className="space-y-8 mb-10">
          {batches.map((b) => {
            const pending = b.proposals.filter((p) => p.status === "pending").length;
            return (
              <section key={b.id} className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold flex items-center gap-2">
                      {b.title}
                      <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground capitalize font-normal">{b.source}</span>
                    </h2>
                    <div className="text-xs text-muted-foreground">
                      <TimeAgo date={b.createdAt} />
                      {b.sourceTask ? (
                        <>
                          {" · from "}
                          <Link href={`/w/${slug}/tasks/${b.sourceTask.number}`} className="hover:underline">T-{b.sourceTask.number} {b.sourceTask.title}</Link>
                        </>
                      ) : null}
                      {" · "}{pending} pending of {b.proposals.length}
                    </div>
                    {b.summary ? <div className="mt-1"><Markdown className="text-sm">{b.summary}</Markdown></div> : null}
                  </div>
                  {isOwner && pending > 1 ? (
                    <div className="flex gap-2 shrink-0">
                      <ActionButton size="sm" variant="outline" action={acceptAllPending.bind(null, b.id, {})}>Accept all</ActionButton>
                      {b.sourceTask && !b.sourceTask.parentId ? (
                        <ActionButton size="sm" variant="outline" action={acceptAllPending.bind(null, b.id, { asSubtasks: true })}>Accept all as subtasks</ActionButton>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <ul className="space-y-2">
                  {b.proposals.map((p) => (
                    <ProposalCard key={p.id} p={p} slug={slug} isOwner={isOwner} canSubtask={!!b.sourceTask && !b.sourceTask.parentId} resultingNumber={p.resultingTask?.number ?? null} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Manual breakdown</h2>
        <p className="text-xs text-muted-foreground">
          One proposal per line: <code className="font-mono">Title :: what to do :: acceptance criteria</code>. Optionally attach to a parent task so they can become subtasks.
        </p>
        <ActionForm action={createManualBatch.bind(null, ws.id)} resetOnSuccess successMessage="Proposals created" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pb-title">Batch title</Label>
              <Input id="pb-title" name="title" placeholder="Checkout redesign breakdown" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-task">Source task (optional)</Label>
              <select id="pb-task" name="sourceTaskId" className="h-8 w-full rounded-md border bg-background px-2 text-sm" defaultValue="">
                <option value="">None</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>T-{t.number} {t.title}</option>
                ))}
              </select>
            </div>
          </div>
          <Textarea name="items" rows={5} placeholder={"Add cart summary component :: Build the right-hand summary with totals :: Matches Figma, totals update live\nWire coupon API :: POST /coupons/apply :: Invalid codes show inline error"} />
          <Button type="submit" size="sm">Create proposals</Button>
        </ActionForm>
      </section>
    </div>
  );
}
