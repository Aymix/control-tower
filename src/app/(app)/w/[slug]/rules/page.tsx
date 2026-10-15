import Link from "next/link";
import { Markdown } from "@/components/common/markdown";
import { ActionForm } from "@/components/forms/action-form";
import { RulesField } from "@/components/settings/rules-editor";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getOrgSettings } from "@/server/queries/org";
import { updateWorkspaceRules } from "@/server/actions/workspaces";
import { requireUser, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Rules" };

export default async function RulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const org = await getOrgSettings();
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Rules"
        description="Every Claude session in this workspace receives: global rules → guardrails → these workspace rules → pinned knowledge → the task. Devs can edit workspace rules."
      />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Workspace rules</h2>
        <ActionForm action={updateWorkspaceRules.bind(null, ws.id)} successMessage="Rules saved" className="space-y-3">
          <RulesField
            name="rules"
            label="Rules for this client"
            hint="Stack conventions, test commands, branch policy, things this client cares about. Markdown."
            defaultValue={ws.rules}
            rows={16}
          />
          <Button type="submit" size="sm">Save workspace rules</Button>
        </ActionForm>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Inherited from the organisation</h2>
          {me.role === "owner" ? <Button asChild size="xs" variant="outline"><Link href="/settings">Edit in Settings</Link></Button> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Global rules</div>
            {org.globalRules.trim() ? <Markdown className="text-[13px]">{org.globalRules}</Markdown> : <p className="text-sm text-muted-foreground italic">None set.</p>}
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Guardrails</div>
            {org.guardrails.trim() ? <Markdown className="text-[13px]">{org.guardrails}</Markdown> : <p className="text-sm text-muted-foreground italic">None set.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
