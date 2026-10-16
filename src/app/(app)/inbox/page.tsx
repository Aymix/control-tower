import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { Inbox as InboxIcon, MessageSquare } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Markdown } from "@/components/common/markdown";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { TimeAgo } from "@/components/common/time";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/db";
import { briefing, comment, task } from "@/db/schema";
import { listAccessibleWorkspaces, requireUser } from "@/server/auth";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const me = await requireUser();
  const workspaces = await listAccessibleWorkspaces(me);
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const wsIds = workspaces.map((w) => w.id);

  if (!wsIds.length) {
    return (
      <div className="p-5">
        <PageHeader title="Inbox" description="Work that needs your attention across all workspaces." />
        <EmptyState
          icon={InboxIcon}
          title="Nothing here yet"
          description={me.role === "owner" ? "Create a workspace under Settings to get started." : "You have not been added to any workspace yet."}
        />
      </div>
    );
  }

  const attention = await db.query.task.findMany({
    where:
      me.role === "owner"
        ? and(inArray(task.workspaceId, wsIds), or(eq(task.status, "in_review"), eq(task.status, "blocked")), ne(task.number, 0))
        : and(inArray(task.workspaceId, wsIds), eq(task.assigneeId, me.id), inArray(task.status, ["in_progress", "blocked", "in_review", "backlog"])),
    with: { assignee: { columns: { name: true } }, pullRequests: { columns: { id: true, state: true, ciStatus: true } } },
    orderBy: [desc(task.updatedAt)],
    limit: 100,
  });

  const recentComments = await db
    .select({ c: comment, t: { id: task.id, number: task.number, title: task.title, workspaceId: task.workspaceId } })
    .from(comment)
    .innerJoin(task, eq(task.id, comment.taskId))
    .where(and(inArray(task.workspaceId, wsIds), me.role === "owner" ? undefined : eq(task.assigneeId, me.id)))
    .orderBy(desc(comment.createdAt))
    .limit(25);

  const drafts = me.role === "owner" ? await db.query.briefing.findMany({ where: and(inArray(briefing.workspaceId, wsIds), eq(briefing.status, "draft")), orderBy: [desc(briefing.updatedAt)], limit: 20 }) : [];
  const inReview = attention.filter((t) => t.status === "in_review");
  const blocked = attention.filter((t) => t.status === "blocked");
  const mine = attention.filter((t) => t.status !== "in_review" && t.status !== "blocked");

  const section = (title: string, items: typeof attention, hint?: string) =>
    items.length ? (
      <section key={title}>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          {title} <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
        </h2>
        {hint ? <p className="text-xs text-muted-foreground mb-2">{hint}</p> : null}
        <ul className="rounded-lg border divide-y">
          {items.map((t) => {
            const ws = wsById.get(t.workspaceId)!;
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40">
                <Link href={`/w/${ws.slug}/tasks/${t.number}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">T-{t.number}</span>
                    <span className="truncate font-medium">{t.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 items-center">
                    <span>{ws.name}</span>
                    {t.assignee ? <span>· {t.assignee.name}</span> : null}
                    {t.status === "blocked" && t.blockedReason ? <span className="truncate">· {t.blockedReason}</span> : null}
                    {t.pullRequests.length ? <span>· {t.pullRequests.length} PR{t.pullRequests.length > 1 ? "s" : ""}</span> : null}
                  </div>
                </Link>
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
                <TimeAgo date={t.updatedAt} className="text-xs text-muted-foreground w-14 text-right shrink-0" />
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  return (
    <div className="p-5 max-w-5xl">
      <PageHeader
        title="Inbox"
        description={me.role === "owner" ? "Tasks waiting for your review or blocked, plus recent activity." : "Your tasks and recent activity on them."}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {me.role === "owner" ? (
            <>
              {drafts.length ? (
                <section>
                  <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">Briefing drafts to review <span className="text-xs font-normal text-muted-foreground">{drafts.length}</span></h2>
                  <ul className="rounded-lg border divide-y">
                    {drafts.map((b) => {
                      const ws = wsById.get(b.workspaceId)!;
                      return (
                        <li key={b.id} className="px-3 py-2 hover:bg-accent/40">
                          <Link href={`/w/${ws.slug}/briefings/${b.id}`} className="flex items-center gap-2">
                            <span className="truncate font-medium flex-1">{b.title}</span>
                            <span className="text-xs text-muted-foreground">{ws.name}</span>
                            <TimeAgo date={b.updatedAt} className="text-xs text-muted-foreground w-14 text-right" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              {section("Waiting for review", inReview, "Only you can approve these as Done.")}
              {section("Blocked", blocked)}
            </>
          ) : (
            <>
              {section("Blocked", blocked)}
              {section("In review", inReview)}
              {section("My tasks", mine)}
            </>
          )}
          {attention.length === 0 ? (
            <EmptyState icon={InboxIcon} title="All clear" description="Nothing is waiting on you right now." />
          ) : null}
        </div>
        <aside>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <MessageSquare className="size-4" /> Recent updates
          </h2>
          {recentComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentComments.map(({ c, t }) => {
                const ws = wsById.get(t.workspaceId)!;
                return (
                  <li key={c.id} className="text-sm">
                    <Link href={`/w/${ws.slug}/tasks/${t.number}`} className="text-xs text-muted-foreground hover:text-foreground">
                      T-{t.number} {t.title} · <TimeAgo date={c.createdAt} />
                    </Link>
                    <div className="mt-0.5 line-clamp-3">
                      <Markdown>{c.body}</Markdown>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
