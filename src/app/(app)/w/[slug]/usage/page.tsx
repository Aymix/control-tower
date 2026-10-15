import { Gauge } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Usage" };

export default async function UsagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Usage" description={ws.budgetCents != null ? `Budget: $${(ws.budgetCents / 100).toLocaleString()}` : "No budget set for this workspace."} />
      <EmptyState icon={Gauge} title="No Claude sessions yet" description="Tokens and estimated cost per session appear here once Claude sessions (phase 2) run in this workspace." />
    </div>
  );
}
