import { asc, eq } from "drizzle-orm";
import { Check, FolderGit2, RefreshCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { SyncClaudeMdButton } from "@/components/sources/claude-md-button";
import { ActionForm } from "@/components/forms/action-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { repo } from "@/db/schema";
import { addRepo, recheckRepo, removeRepo } from "@/server/actions/repos";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Repos" };

export default async function ReposPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const repos = await db.query.repo.findMany({ where: eq(repo.workspaceId, ws.id), orderBy: [asc(repo.owner), asc(repo.name)], with: { pullRequests: { columns: { id: true, state: true } } } });
  const isOwner = me.role === "owner";
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Repositories"
        description="GitHub repos Claude may work in. Open PRs on branches named t<number>-… are discovered automatically. “Sync CLAUDE.md” opens a PR that writes the rules and pinned knowledge into the repo between managed markers."
      />
      {!ws.githubPatEnc ? (
        <div className="rounded-lg border bg-amber-500/10 px-3 py-2 text-sm">
          No GitHub token yet. {isOwner ? <Link href={`/w/${slug}/settings`} className="underline">Add a fine-grained PAT in settings</Link> : "Ask the owner to add a PAT in workspace settings"} to check access and poll PRs.
        </div>
      ) : null}
      {repos.length === 0 ? (
        <EmptyState icon={FolderGit2} title="No repositories" description="Register the client's repos (owner/name). The PAT needs Contents, Pull requests and Checks read access, plus write to open PRs." />
      ) : (
        <ul className="rounded-lg border divide-y">
          {repos.map((r) => {
            const open = r.pullRequests.filter((p) => p.state === "open").length;
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FolderGit2 className="size-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <a href={`https://github.com/${r.owner}/${r.name}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {r.owner}/{r.name}
                  </a>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>default <code className="font-mono">{r.defaultBranch}</code></span>
                    <span>·</span>
                    {r.pushAccess === null ? (
                      <span>access not checked</span>
                    ) : r.pushAccess ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="size-3" /> push access</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><X className="size-3" /> read-only</span>
                    )}
                    {open ? <span>· {open} open PR{open > 1 ? "s" : ""}</span> : null}
                    {r.lastCheckedAt ? <span>· checked <TimeAgo date={r.lastCheckedAt} /></span> : null}
                  </div>
                  {r.checkError ? <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">{r.checkError}</div> : null}
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>CLAUDE.md:</span>
                    {r.claudeMdError ? <span className="text-red-600 dark:text-red-400">{r.claudeMdError}</span> : r.claudeMdSyncedAt ? <span>synced <TimeAgo date={r.claudeMdSyncedAt} />{r.claudeMdPrUrl ? <> · <a href={r.claudeMdPrUrl} target="_blank" rel="noreferrer" className="underline">PR</a></> : null}</span> : <span>never synced</span>}
                  </div>
                </div>
                {isOwner ? <SyncClaudeMdButton repoId={r.id} disabled={!ws.githubPatEnc || r.pushAccess === false} /> : null}
                <ActionButton size="icon-xs" variant="ghost" action={recheckRepo.bind(null, r.id)} title="Re-check access and discover PRs" successMessage="Repo checked">
                  <RefreshCw className="size-3.5" />
                </ActionButton>
                {isOwner ? (
                  <ActionButton size="icon-xs" variant="ghost" action={removeRepo.bind(null, r.id)} confirm={`Remove ${r.owner}/${r.name}? Linked PRs are removed too.`} title="Remove">
                    <Trash2 className="size-3.5" />
                  </ActionButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {isOwner ? (
        <ActionForm action={addRepo.bind(null, ws.id)} resetOnSuccess successMessage="Repo added" className="flex gap-2 max-w-md">
          <Input name="fullName" placeholder="owner/name or GitHub URL" required />
          <Button type="submit" size="sm">Add repo</Button>
        </ActionForm>
      ) : null}
    </div>
  );
}
