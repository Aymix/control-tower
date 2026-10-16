import { desc, eq, inArray } from "drizzle-orm";
import { Globe } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { AddSourceDialog } from "@/components/sources/source-form";
import { SourceRow } from "@/components/sources/source-row";
import { db } from "@/db";
import { kbDocument, kbSource } from "@/db/schema";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Sources" };

export default async function SourcesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const sources = await db.query.kbSource.findMany({ where: eq(kbSource.workspaceId, ws.id), orderBy: [desc(kbSource.pinned), desc(kbSource.updatedAt)] });
  const docIds = sources.map((s) => s.documentId).filter((x): x is string => !!x);
  const docs = docIds.length ? await db.query.kbDocument.findMany({ where: inArray(kbDocument.id, docIds), columns: { id: true, currentVersion: true } }) : [];
  const version = (id: string | null) => docs.find((d) => d.id === id)?.currentVersion ?? null;
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow={<Link href={`/w/${slug}/knowledge`} className="hover:underline">Knowledge base</Link>}
        title="External sources"
        description="Web pages, Notion, Confluence and link-shared Google Docs snapshotted into the knowledge base. Pinned snapshots go into every Claude session's context."
        actions={<AddSourceDialog workspaceId={ws.id} />}
      />
      {sources.length === 0 ? (
        <EmptyState icon={Globe} title="No external sources" description="Add the client's spec, architecture page or meeting notes from wherever they live. Each one becomes a versioned document here." />
      ) : (
        <ul className="rounded-lg border divide-y">
          {sources.map((s) => <SourceRow key={s.id} src={s} slug={slug} docVersion={version(s.documentId)} />)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground mt-4">Scheduled re-syncs run in the background worker every 5 minutes for sources whose interval has elapsed. Secrets are encrypted at rest with the master key.</p>
    </div>
  );
}
