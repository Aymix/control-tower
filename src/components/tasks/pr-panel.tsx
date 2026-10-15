import { ExternalLink, GitPullRequest, RefreshCw, Unlink } from "lucide-react";
import Link from "next/link";
import { CiBadge, PrStateBadge } from "@/components/common/status-badge";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PullRequest, Repo } from "@/db/schema";
import { linkPullRequestByUrl, refreshPullRequest, unlinkPullRequest } from "@/server/actions/prs";

export function PrPanel({ taskId, slug, prs, hasPat, branchHint }: { taskId: string; slug: string; prs: (PullRequest & { repo: Repo })[]; hasPat: boolean; branchHint: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <GitPullRequest className="size-4" /> Pull requests
      </h2>
      {prs.length ? (
        <ul className="rounded-lg border divide-y">
          {prs.map((pr) => (
            <li key={pr.id} className="px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <PrStateBadge state={pr.state} draft={pr.draft} />
                <Link href={`/w/${slug}/prs/${pr.id}`} className="font-medium truncate hover:underline flex-1 min-w-0">
                  {pr.repo.owner}/{pr.repo.name}#{pr.number} {pr.title}
                </Link>
                <a href={pr.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Open on GitHub">
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <code className="font-mono">{pr.branch}</code>
                <CiBadge status={pr.ciStatus} />
                {pr.state === "open" ? (
                  <span className={pr.mergeable === false ? "text-red-600 dark:text-red-400" : ""}>
                    {pr.mergeable === null ? "mergeability unknown" : pr.mergeable ? "mergeable" : "conflicts"}
                  </span>
                ) : null}
                <span>
                  <span className="text-emerald-600 dark:text-emerald-400">+{pr.additions}</span> <span className="text-red-600 dark:text-red-400">−{pr.deletions}</span>
                </span>
                <span className="ml-auto flex items-center gap-1">
                  polled <TimeAgo date={pr.lastPolledAt} /> · {pr.pollPriority}
                  <ActionButton size="icon-xs" variant="ghost" action={refreshPullRequest.bind(null, pr.id)} title="Refresh now">
                    <RefreshCw className="size-3" />
                  </ActionButton>
                  <ActionButton size="icon-xs" variant="ghost" action={unlinkPullRequest.bind(null, pr.id)} confirm="Unlink this PR from the task?" title="Unlink">
                    <Unlink className="size-3" />
                  </ActionButton>
                </span>
              </div>
              {pr.pollError ? <div className="mt-1 text-xs text-red-600 dark:text-red-400">{pr.pollError}</div> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No PR yet. Branches named <code className="font-mono">{branchHint}</code> are linked automatically; or paste a PR URL.
        </p>
      )}
      <ActionForm action={linkPullRequestByUrl.bind(null, taskId)} resetOnSuccess className="flex gap-2">
        <Input name="url" placeholder="https://github.com/owner/repo/pull/123" className="h-8" disabled={!hasPat} />
        <Button type="submit" size="sm" variant="outline" disabled={!hasPat}>Link</Button>
      </ActionForm>
      {!hasPat ? <p className="text-xs text-amber-600 dark:text-amber-400">Add a GitHub token in workspace settings to link and poll PRs.</p> : null}
    </section>
  );
}
