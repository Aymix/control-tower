import { desc, eq } from "drizzle-orm";
import { GitPullRequest } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { CiBadge, PrStateBadge } from "@/components/common/status-badge";
import { TimeAgo } from "@/components/common/time";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { pullRequest } from "@/db/schema";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Pull requests" };

export default async function PrsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const prs = await db.query.pullRequest.findMany({
    where: eq(pullRequest.workspaceId, ws.id),
    with: { repo: true, task: { columns: { number: true, title: true, status: true } } },
    orderBy: [desc(pullRequest.state), desc(pullRequest.ghUpdatedAt)],
  });
  const open = prs.filter((p) => p.state === "open");
  const closed = prs.filter((p) => p.state !== "open");
  const list = (items: typeof prs) => (
    <ul className="rounded-lg border divide-y text-sm">
      {items.map((pr) => (
        <li key={pr.id} className="px-3 py-2 hover:bg-accent/40">
          <div className="flex items-center gap-2">
            <PrStateBadge state={pr.state} draft={pr.draft} />
            <Link href={`/w/${slug}/prs/${pr.id}`} className="font-medium truncate flex-1 hover:underline">{pr.title || `#${pr.number}`}</Link>
            <CiBadge status={pr.ciStatus} />
            <span className="text-xs tabular-nums"><span className="text-emerald-600 dark:text-emerald-400">+{pr.additions}</span> <span className="text-red-600 dark:text-red-400">−{pr.deletions}</span></span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-2">
            <span>{pr.repo.owner}/{pr.repo.name}#{pr.number}</span>
            <span>· <code className="font-mono">{pr.branch}</code></span>
            {pr.task ? <Link href={`/w/${slug}/tasks/${pr.task.number}`} className="hover:underline">· T-{pr.task.number} {pr.task.title}</Link> : <span>· unlinked</span>}
            {pr.author ? <span>· {pr.author}</span> : null}
            <span className="ml-auto">updated <TimeAgo date={pr.ghUpdatedAt} /> · polled <TimeAgo date={pr.lastPolledAt} /> ({pr.pollPriority})</span>
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Pull requests" description="Everything linked to tasks in this workspace, kept fresh by the poller (hot every minute, warm every 5, cold every 30)." />
      {prs.length === 0 ? (
        <EmptyState icon={GitPullRequest} title="No pull requests yet" description="PRs appear here when a branch named t<number>-… is opened in a registered repo, or when you paste a PR URL on a task." />
      ) : (
        <>
          {open.length ? <section className="space-y-2"><h2 className="text-sm font-semibold">Open ({open.length})</h2>{list(open)}</section> : null}
          {closed.length ? <section className="space-y-2"><h2 className="text-sm font-semibold">Merged & closed ({closed.length})</h2>{list(closed)}</section> : null}
        </>
      )}
    </div>
  );
}
