import { and, desc, eq } from "drizzle-orm";
import { Archive, ArchiveRestore, Pin, PinOff } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/common/markdown";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { DocForm, KIND_LABEL } from "@/components/kb/doc-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { kbDocument, kbVersion } from "@/db/schema";
import { setDocumentArchived, setDocumentPinned, updateDocument } from "@/server/actions/kb";
import { requireUser, requireWorkspace } from "@/server/auth";

export default async function DocPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ edit?: string; v?: string }> }) {
  const { slug, id } = await params;
  const { edit, v } = await searchParams;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const doc = await db.query.kbDocument.findFirst({ where: and(eq(kbDocument.id, id), eq(kbDocument.workspaceId, ws.id)) });
  if (!doc) notFound();
  const versions = await db.query.kbVersion.findMany({ where: eq(kbVersion.documentId, doc.id), orderBy: [desc(kbVersion.version)] });
  const users = await db.query.user.findMany({ columns: { id: true, name: true } });
  const nameOf = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const shown = (v ? versions.find((x) => x.version === Number(v)) : null) ?? versions[0];
  const isCurrent = shown.version === doc.currentVersion;
  const base = `/w/${slug}/knowledge/${doc.id}`;

  if (edit === "1") {
    return (
      <div className="max-w-4xl">
        <PageHeader title={`Edit: ${doc.title}`} eyebrow="Knowledge base" description={`Saving creates version ${doc.currentVersion + 1}.`} />
        <DocForm action={updateDocument.bind(null, doc.id)} defaults={{ title: doc.title, kind: doc.kind, content: versions[0].content }} submitLabel="Save new version" showNote cancelHref={base} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow={<Link href={`/w/${slug}/knowledge`} className="hover:underline">Knowledge base</Link>}
        title={
          <span className="flex items-center gap-2">
            {doc.pinned ? <Pin className="size-4 text-amber-500" /> : null}
            {doc.title}
            <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground font-normal">{KIND_LABEL[doc.kind]}</span>
            {doc.archivedAt ? <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground font-normal">Archived</span> : null}
          </span>
        }
        description={`Version ${shown.version}${isCurrent ? " (current)" : ""} · ${nameOf(shown.createdBy)} · ${shown.createdAt.toLocaleString()}${shown.note ? ` · ${shown.note}` : ""}`}
        actions={
          <>
            <ActionButton size="sm" variant="outline" action={setDocumentPinned.bind(null, doc.id, !doc.pinned)} disabled={!!doc.archivedAt}>
              {doc.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />} {doc.pinned ? "Unpin" : "Pin"}
            </ActionButton>
            <ActionButton size="sm" variant="outline" action={setDocumentArchived.bind(null, doc.id, !doc.archivedAt)}>
              {doc.archivedAt ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} {doc.archivedAt ? "Unarchive" : "Archive"}
            </ActionButton>
            {!doc.archivedAt ? (
              <Button asChild size="sm"><Link href={`${base}?edit=1`}>Edit</Link></Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_220px]">
        <article className="min-w-0">
          {shown.content.trim() ? <Markdown>{shown.content}</Markdown> : <p className="text-sm text-muted-foreground italic">Empty document.</p>}
        </article>
        <aside>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Versions</h2>
          <ol className="space-y-1 text-sm">
            {versions.map((ver) => (
              <li key={ver.id}>
                <Link href={ver.version === doc.currentVersion ? base : `${base}?v=${ver.version}`} className={`block rounded px-2 py-1 hover:bg-accent ${ver.version === shown.version ? "bg-accent" : ""}`}>
                  <div className="flex justify-between"><span>v{ver.version}</span><TimeAgo date={ver.createdAt} className="text-xs text-muted-foreground" /></div>
                  <div className="text-xs text-muted-foreground truncate">{nameOf(ver.createdBy)}{ver.note ? ` · ${ver.note}` : ""}</div>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
