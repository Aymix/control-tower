import { and, eq } from "drizzle-orm";
import { ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiffViewer } from "@/components/diff/diff-viewer";
import { CiBadge, PrStateBadge } from "@/components/common/status-badge";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { pullRequest } from "@/db/schema";
import { parseUnifiedDiff } from "@/lib/diff/parse";
import { refreshPullRequest } from "@/server/actions/prs";
import { requireUser, requireWorkspace } from "@/server/auth";
import { describeGithubError, fetchPullDiff, octokitFor } from "@/server/github";

export default async function PrPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const pr = await db.query.pullRequest.findFirst({ where: and(eq(pullRequest.id, id), eq(pullRequest.workspaceId, ws.id)), with: { repo: true, task: { columns: { number: true, title: true } } } });
  if (!pr) notFound();

  let files: ReturnType<typeof parseUnifiedDiff> = [];
  let diffError: string | null = null;
  if (ws.githubPatEnc) {
    try {
      const raw = await fetchPullDiff(octokitFor(ws), pr.repo.owner, pr.repo.name, pr.number);
      files = parseUnifiedDiff(raw);
    } catch (err) {
      diffError = describeGithubError(err);
    }
  } else diffError = "No GitHub token configured for this workspace.";

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1">
            <Link href={`/w/${slug}/prs`} className="hover:underline">Pull requests</Link> · {pr.repo.owner}/{pr.repo.name}#{pr.number}
            {pr.task ? <> · <Link href={`/w/${slug}/tasks/${pr.task.number}`} className="hover:underline">T-{pr.task.number} {pr.task.title}</Link></> : null}
          </span>
        }
        title={
          <span className="flex items-center gap-2">
            <PrStateBadge state={pr.state} draft={pr.draft} /> {pr.title}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <code className="font-mono text-xs">{pr.branch}</code> → <code className="font-mono text-xs">{pr.baseBranch}</code>
            <CiBadge status={pr.ciStatus} />
            {pr.state === "open" ? <span className={pr.mergeable === false ? "text-red-600 dark:text-red-400" : ""}>{pr.mergeable === null ? "mergeability unknown" : pr.mergeable ? "mergeable" : "has conflicts"}</span> : null}
            {pr.author ? <span>by {pr.author}</span> : null}
            <span>updated <TimeAgo date={pr.ghUpdatedAt} /></span>
            <span>polled <TimeAgo date={pr.lastPolledAt} /> ({pr.pollPriority})</span>
          </span>
        }
        actions={
          <>
            <ActionButton size="sm" variant="outline" action={refreshPullRequest.bind(null, pr.id)} successMessage="Refreshed"><RefreshCw className="size-3.5" /> Refresh</ActionButton>
            <Button asChild size="sm" variant="outline"><a href={pr.url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> GitHub</a></Button>
          </>
        }
      />
      {pr.pollError ? <div className="mb-4 rounded-lg border bg-red-500/10 px-3 py-2 text-sm">Last poll failed: {pr.pollError}</div> : null}
      {diffError ? <div className="rounded-lg border bg-amber-500/10 px-3 py-2 text-sm">Could not load the diff: {diffError}</div> : <DiffViewer files={files} />}
    </div>
  );
}
