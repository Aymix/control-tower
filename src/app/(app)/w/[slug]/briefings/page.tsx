import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Briefings" };

export default async function BriefingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  await requireWorkspace(me, slug);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Briefings" description="Client communication drafted in your voice: status updates, pre-task questions, blockers and release notes. You review, edit and send them yourself." />
      <EmptyState
        icon={Megaphone}
        title="Briefings arrive in phase 3"
        description="They will be drafted from the style guide, task state, PRs and the knowledge base on the owner's runner. Nothing is ever sent automatically."
      />
    </div>
  );
}
