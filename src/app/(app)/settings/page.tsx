import { Archive, ArchiveRestore, Plus } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { RulesField } from "@/components/settings/rules-editor";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { updateOrgSettings } from "@/server/actions/org";
import { getOrgSettings } from "@/server/queries/org";
import { archiveWorkspace, createWorkspace } from "@/server/actions/workspaces";
import { requireOwner } from "@/server/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireOwner();
  const org = await getOrgSettings();
  const workspaces = await db.query.workspace.findMany({ orderBy: (w, { asc }) => [asc(w.name)], with: { members: true, repos: { columns: { id: true } } } });

  return (
    <div className="p-5 max-w-4xl space-y-10">
      <PageHeader
        title="Settings"
        description="Organisation-wide rules and workspaces. Rules apply to every Claude session; the style guide shapes client-facing text."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/audit">Audit log</Link>
          </Button>
        }
      />

      <section id="workspaces" className="space-y-3">
        <h2 className="text-sm font-semibold">Workspaces</h2>
        <p className="text-xs text-muted-foreground">One workspace per client. Each has its own rules, knowledge base, repos, PAT and members.</p>
        <ul className="rounded-lg border divide-y">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <Link href={`/w/${w.slug}`} className="font-medium hover:underline">
                  {w.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {w.clientName} · {w.members.length} member{w.members.length === 1 ? "" : "s"} · {w.repos.length} repo{w.repos.length === 1 ? "" : "s"}
                  {w.githubPatLast4 ? ` · PAT ••••${w.githubPatLast4}` : " · no PAT"}
                  {w.archivedAt ? " · archived" : ""}
                </div>
              </div>
              <Button asChild size="xs" variant="outline">
                <Link href={`/w/${w.slug}/settings`}>Configure</Link>
              </Button>
              <ActionButton size="xs" variant="ghost" action={archiveWorkspace.bind(null, w.id, !w.archivedAt)} title={w.archivedAt ? "Unarchive" : "Archive"}>
                {w.archivedAt ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
              </ActionButton>
            </li>
          ))}
          {workspaces.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">No workspaces yet.</li> : null}
        </ul>
        <ActionForm action={createWorkspace} className="rounded-lg border p-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input id="ws-name" name="name" placeholder="Acme platform" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-client">Client name</Label>
            <Input id="ws-client" name="clientName" placeholder="Acme Inc." required />
          </div>
          <Button type="submit" size="sm">
            <Plus className="size-4" /> Create
          </Button>
        </ActionForm>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Organisation rules</h2>
        <ActionForm action={updateOrgSettings} successMessage="Settings saved" className="space-y-5">
          <div className="space-y-1.5 max-w-sm">
            <Label htmlFor="org-name">Organisation name</Label>
            <Input id="org-name" name="name" defaultValue={org.name} />
          </div>
          <RulesField
            name="globalRules"
            label="Global rules"
            hint="Prepended to every Claude session in every workspace: conventions, review expectations, definition of done."
            defaultValue={org.globalRules}
          />
          <RulesField
            name="guardrails"
            label="Guardrails"
            hint="Hard limits: what must never happen (force pushes, touching prod data, secrets in code…). Enforced in prompts and, where possible, by tool guards."
            defaultValue={org.guardrails}
            rows={8}
          />
          <RulesField
            name="styleGuide"
            label="Style guide (your voice)"
            hint="How you write to clients. Briefings (phase 3) are drafted from this: tone, length, sign-off, words to avoid."
            defaultValue={org.styleGuide}
          />
          <Button type="submit" size="sm">Save rules</Button>
        </ActionForm>
      </section>
    </div>
  );
}
