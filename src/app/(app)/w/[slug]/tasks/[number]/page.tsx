import { and, asc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { TimeAgo } from "@/components/common/time";
import { Blockers } from "@/components/tasks/blockers";
import { CommentTimeline } from "@/components/tasks/comments";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { PrPanel } from "@/components/tasks/pr-panel";
import { StatusControl } from "@/components/tasks/status-control";
import { SessionPanel } from "@/components/sessions/session-panel";
import { repo, runnerToken } from "@/db/schema";
import { latestSessionsForTask } from "@/server/sessions/service";
import { runnerIsOnline } from "@/server/runner-auth";
import { TaskEditor } from "@/components/tasks/task-editor";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { comment, task, taskBlocker } from "@/db/schema";
import { branchNameFor } from "@/lib/prs/branch";
import { requireUser, requireWorkspace } from "@/server/auth";
import { loadAssignees } from "@/server/queries/board";

export default async function TaskPage({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const n = Number.parseInt(number, 10);
  if (!Number.isFinite(n)) notFound();
  const t = await db.query.task.findFirst({
    where: and(eq(task.workspaceId, ws.id), eq(task.number, n)),
    with: {
      assignee: { columns: { id: true, name: true } },
      parent: { columns: { id: true, number: true, title: true } },
      subtasks: { columns: { id: true, number: true, title: true, status: true, priority: true }, orderBy: [asc(task.number)] },
      pullRequests: { with: { repo: true } },
    },
  });
  if (!t) notFound();
  const [comments, blockedByRows, blockingRows, members] = await Promise.all([
    db.query.comment.findMany({ where: eq(comment.taskId, t.id), with: { author: { columns: { name: true } } }, orderBy: [asc(comment.createdAt)] }),
    db.query.taskBlocker.findMany({ where: eq(taskBlocker.taskId, t.id), with: { blockedBy: { columns: { id: true, number: true, title: true, status: true } } } }),
    db.query.taskBlocker.findMany({ where: eq(taskBlocker.blockedById, t.id), with: { task: { columns: { id: true, number: true, title: true, status: true } } } }),
    loadAssignees(ws.id),
  ]);
  const doneSubs = t.subtasks.filter((s) => s.status === "done").length;
  const [sessions, repos, myRunners] = await Promise.all([
    latestSessionsForTask(t.id),
    db.query.repo.findMany({ where: eq(repo.workspaceId, ws.id), columns: { id: true, owner: true, name: true } }),
    db.query.runnerToken.findMany({ where: eq(runnerToken.userId, me.id) }),
  ]);
  const hasOnlineRunner = myRunners.some((r) => runnerIsOnline(r));

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <Link href={`/w/${slug}/board`} className="hover:text-foreground">Board</Link>
        {t.parent ? (
          <>
            <ChevronRight className="size-3" />
            <Link href={`/w/${slug}/tasks/${t.parent.number}`} className="hover:text-foreground truncate max-w-[280px]">
              T-{t.parent.number} {t.parent.title}
            </Link>
          </>
        ) : null}
        <ChevronRight className="size-3" />
        <span className="font-mono text-foreground">T-{t.number}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-8 min-w-0">
          <TaskEditor task={t} members={members} />

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Subtasks {t.subtasks.length ? <span className="text-muted-foreground font-normal">{doneSubs}/{t.subtasks.length}</span> : null}
              </h2>
              {!t.parentId ? (
                <NewTaskDialog workspaceId={ws.id} slug={slug} members={members} parentId={t.id} trigger={<Button size="xs" variant="outline">Add subtask</Button>} />
              ) : null}
            </div>
            {t.subtasks.length ? (
              <ul className="rounded-lg border divide-y">
                {t.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">T-{s.number}</span>
                    <Link href={`/w/${slug}/tasks/${s.number}`} className="flex-1 truncate hover:underline">{s.title}</Link>
                    <PriorityBadge priority={s.priority} />
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            ) : t.parentId ? null : (
              <p className="text-xs text-muted-foreground">No subtasks. Break big tasks down here, or let a planning session propose them.</p>
            )}
          </section>

          <PrPanel taskId={t.id} slug={slug} prs={t.pullRequests} hasPat={!!ws.githubPatEnc} branchHint={branchNameFor(t.number, t.title)} />

          <SessionPanel taskId={t.id} slug={slug} sessions={sessions} defaultModel={ws.defaultModel} repos={repos} hasOnlineRunner={hasOnlineRunner} taskDone={t.status === "done"} />

          <CommentTimeline taskId={t.id} comments={comments} />
        </div>

        <aside className="space-y-5 lg:border-l lg:pl-6">
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Status</div>
            <StatusControl taskId={t.id} taskNumber={t.number} status={t.status} role={me.role} />
            {t.status === "blocked" && t.blockedReason ? <p className="text-xs text-red-700 dark:text-red-300">{t.blockedReason}</p> : null}
            {t.status === "in_review" && me.role !== "owner" ? <p className="text-xs text-muted-foreground">Waiting for the owner to approve.</p> : null}
          </div>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Priority</dt><dd><PriorityBadge priority={t.priority} /></dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Assignee</dt><dd>{t.assignee?.name ?? <span className="text-muted-foreground">Unassigned</span>}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Created</dt><dd><TimeAgo date={t.createdAt} /></dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Updated</dt><dd><TimeAgo date={t.updatedAt} /></dd></div>
            {t.doneAt ? <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Done</dt><dd><TimeAgo date={t.doneAt} /></dd></div> : null}
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Branch</dt><dd className="font-mono text-xs truncate max-w-[180px]" title={branchNameFor(t.number, t.title)}>{branchNameFor(t.number, t.title)}</dd></div>
          </dl>
          <Blockers taskId={t.id} slug={slug} blockedBy={blockedByRows.map((b) => b.blockedBy)} blocking={blockingRows.map((b) => b.task)} />
          {me.role === "owner" ? (
            <DeleteTaskButton taskId={t.id} number={t.number} slug={slug} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
