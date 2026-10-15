import { desc, eq } from "drizzle-orm";
import { Archive, BookOpen, Pin, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/time";
import { KIND_LABEL } from "@/components/kb/doc-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { kbDocument } from "@/db/schema";
import { requireUser, requireWorkspace } from "@/server/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Knowledge" };

export default async function KnowledgePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ archived?: string }> }) {
  const { slug } = await params;
  const { archived } = await searchParams;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const docs = await db.query.kbDocument.findMany({ where: eq(kbDocument.workspaceId, ws.id), orderBy: [desc(kbDocument.pinned), desc(kbDocument.updatedAt)] });
  const showArchived = archived === "1";
  const visible = docs.filter((d) => (showArchived ? !!d.archivedAt : !d.archivedAt));
  const archivedCount = docs.filter((d) => d.archivedAt).length;
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Knowledge base"
        description="Scope, architecture, decisions, meeting notes and plans. Pinned documents are always included in Claude's context."
        actions={
          <>
            {archivedCount ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={showArchived ? `/w/${slug}/knowledge` : `/w/${slug}/knowledge?archived=1`}>
                  <Archive className="size-3.5" /> {showArchived ? "Back to active" : `Archived (${archivedCount})`}
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm">
              <Link href={`/w/${slug}/knowledge/new`}><Plus className="size-4" /> New document</Link>
            </Button>
          </>
        }
      />
      {visible.length === 0 ? (
        <EmptyState icon={BookOpen} title={showArchived ? "No archived documents" : "No documents yet"} description="Start with a scope document and the architecture overview. Claude reads these before touching code." />
      ) : (
        <ul className="rounded-lg border divide-y">
          {visible.map((d) => (
            <li key={d.id} className="px-3 py-2 text-sm hover:bg-accent/40">
              <Link href={`/w/${slug}/knowledge/${d.id}`} className="flex items-center gap-3">
                {d.pinned ? <Pin className="size-3.5 text-amber-500" /> : <BookOpen className="size-3.5 text-muted-foreground" />}
                <span className={cn("font-medium flex-1 truncate", d.archivedAt && "line-through text-muted-foreground")}>{d.title}</span>
                <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground">{KIND_LABEL[d.kind]}</span>
                <span className="text-xs text-muted-foreground w-10 text-right">v{d.currentVersion}</span>
                <TimeAgo date={d.updatedAt} className="text-xs text-muted-foreground w-16 text-right" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
