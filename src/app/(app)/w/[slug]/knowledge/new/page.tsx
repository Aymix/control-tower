import { DocForm } from "@/components/kb/doc-form";
import { PageHeader } from "@/components/shell/page-header";
import { createDocument } from "@/server/actions/kb";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "New document" };

export default async function NewDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const action = createDocument.bind(null, ws.id);
  return (
    <div className="max-w-4xl">
      <PageHeader title="New document" eyebrow="Knowledge base" />
      <DocForm action={action} submitLabel="Create document" cancelHref={`/w/${slug}/knowledge`} />
    </div>
  );
}
