import { desc, eq, sql } from "drizzle-orm";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/time";
import { SessionStatusBadge, fmtTokens, fmtUsd } from "@/components/sessions/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { agentSession, usageEntry } from "@/db/schema";
import { requireUser, requireWorkspace } from "@/server/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Usage" };

export default async function UsagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const [totals] = await db
    .select({
      cost: sql<number>`coalesce(sum(${usageEntry.costMicros}), 0)`,
      input: sql<number>`coalesce(sum(${usageEntry.inputTokens}), 0)`,
      output: sql<number>`coalesce(sum(${usageEntry.outputTokens}), 0)`,
      cacheRead: sql<number>`coalesce(sum(${usageEntry.cacheReadTokens}), 0)`,
      sessions: sql<number>`count(distinct ${usageEntry.sessionId})`,
    })
    .from(usageEntry)
    .where(eq(usageEntry.workspaceId, ws.id));
  const byModel = await db
    .select({ model: usageEntry.model, cost: sql<number>`sum(${usageEntry.costMicros})`, input: sql<number>`sum(${usageEntry.inputTokens})`, output: sql<number>`sum(${usageEntry.outputTokens})` })
    .from(usageEntry)
    .where(eq(usageEntry.workspaceId, ws.id))
    .groupBy(usageEntry.model);
  const sessions = await db.query.agentSession.findMany({
    where: eq(agentSession.workspaceId, ws.id),
    orderBy: [desc(agentSession.createdAt)],
    limit: 100,
    with: { task: { columns: { number: true } }, creator: { columns: { name: true } } },
  });
  const spent = Number(totals.cost) / 1e6;
  const budget = ws.budgetCents != null ? ws.budgetCents / 100 : null;
  const pct = budget ? Math.min(100, (spent / budget) * 100) : null;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Usage" description="Estimated API-equivalent cost of Claude sessions. Sessions run on personal subscriptions; the numbers are the SDK's estimate, not an invoice." />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estimated spend" value={fmtUsd(spent)} sub={budget ? `of ${fmtUsd(budget)} budget` : "no budget set"} />
        <Stat label="Input tokens" value={fmtTokens(Number(totals.input))} sub={`${fmtTokens(Number(totals.cacheRead))} cache reads`} />
        <Stat label="Output tokens" value={fmtTokens(Number(totals.output))} />
        <Stat label="Sessions with usage" value={String(totals.sessions)} />
      </div>
      {pct != null ? (
        <div>
          <div className="h-2 rounded bg-muted overflow-hidden">
            <div className={cn("h-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{pct.toFixed(0)}% of budget{pct >= 100 ? " — new sessions are blocked until the budget is raised" : ""}</div>
        </div>
      ) : null}
      {byModel.length ? (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="text-left px-3 py-2 font-medium">Model</th><th className="text-right px-3 py-2 font-medium">Input</th><th className="text-right px-3 py-2 font-medium">Output</th><th className="text-right px-3 py-2 font-medium">Est. cost</th></tr></thead>
            <tbody className="divide-y">
              {byModel.map((m) => (
                <tr key={m.model}><td className="px-3 py-1.5 font-mono text-xs">{m.model}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmtTokens(Number(m.input))}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmtTokens(Number(m.output))}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmtUsd(Number(m.cost) / 1e6)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {sessions.length === 0 ? (
        <EmptyState icon={Gauge} title="No Claude sessions yet" description="Tokens and estimated cost per session appear here once sessions run in this workspace." />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="text-left px-3 py-2 font-medium">Session</th><th className="text-left px-3 py-2 font-medium">Status</th><th className="text-right px-3 py-2 font-medium">Turns</th><th className="text-right px-3 py-2 font-medium">In</th><th className="text-right px-3 py-2 font-medium">Out</th><th className="text-right px-3 py-2 font-medium">Cache</th><th className="text-right px-3 py-2 font-medium">Est. cost</th><th className="text-right px-3 py-2 font-medium">When</th></tr>
            </thead>
            <tbody className="divide-y">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5"><Link href={`/w/${slug}/sessions/${s.id}`} className="hover:underline"><span className="font-mono text-xs text-muted-foreground">T-{s.task.number}</span> {s.title}</Link><div className="text-xs text-muted-foreground">{s.kind} · {s.model} · {s.creator?.name}</div></td>
                  <td className="px-3 py-1.5"><SessionStatusBadge status={s.status} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{s.numTurns}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtTokens(s.inputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtTokens(s.outputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtTokens(s.cacheReadTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtUsd(s.costMicros / 1e6)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground"><TimeAgo date={s.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
