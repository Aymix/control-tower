import { eq, ne } from "drizzle-orm";
import { UserMinus, UserPlus } from "lucide-react";
import { PatForm } from "@/components/workspace/pat-form";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { user, workspaceMember } from "@/db/schema";
import { addMemberForm, archiveWorkspace, removeMember, updateWorkspace } from "@/server/actions/workspaces";
import { requireOwner, requireWorkspace } from "@/server/auth";

export const metadata = { title: "Workspace settings" };

const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5-20251001"];

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireOwner();
  const ws = await requireWorkspace(me, slug);
  const members = await db.query.workspaceMember.findMany({ where: eq(workspaceMember.workspaceId, ws.id), with: { user: { columns: { id: true, name: true, role: true } } } });
  const devs = await db.query.user.findMany({ where: ne(user.role, "owner"), columns: { id: true, name: true }, orderBy: (u, { asc }) => [asc(u.name)] });
  const candidates = devs.filter((d) => !members.some((m) => m.userId === d.id));

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title="Workspace settings" description="Client details, model, budget, GitHub access and who can see this workspace." />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Details</h2>
        <ActionForm action={updateWorkspace.bind(null, ws.id)} successMessage="Saved" className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="name">Workspace name</Label><Input id="name" name="name" defaultValue={ws.name} required /></div>
          <div className="space-y-1.5"><Label htmlFor="clientName">Client name</Label><Input id="clientName" name="clientName" defaultValue={ws.clientName} required /></div>
          <div className="space-y-1.5">
            <Label htmlFor="defaultModel">Default model for Claude sessions</Label>
            <Input id="defaultModel" name="defaultModel" defaultValue={ws.defaultModel} list="models" />
            <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div className="space-y-1.5"><Label htmlFor="budget">Budget (USD, estimated Claude usage)</Label><Input id="budget" name="budget" type="number" step="0.01" min="0" defaultValue={ws.budgetCents != null ? (ws.budgetCents / 100).toString() : ""} placeholder="No limit" /></div>
          <div className="sm:col-span-2"><Button type="submit" size="sm">Save details</Button></div>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">GitHub access</h2>
        <PatForm workspaceId={ws.id} last4={ws.githubPatLast4} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Members</h2>
        <p className="text-xs text-muted-foreground">Devs only see workspaces they are a member of. You, the owner, see everything.</p>
        <ul className="rounded-lg border divide-y text-sm">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1">{m.user.name}</span>
              <ActionButton size="icon-xs" variant="ghost" action={removeMember.bind(null, ws.id, m.userId)} confirm={`Remove ${m.user.name} from this workspace?`} title="Remove"><UserMinus className="size-3.5" /></ActionButton>
            </li>
          ))}
          {members.length === 0 ? <li className="px-3 py-2 text-muted-foreground">No members yet. Only you can see this workspace.</li> : null}
        </ul>
        {candidates.length ? (
          <ActionForm action={addMemberForm.bind(null, ws.id)} successMessage="Member added" className="flex gap-2 max-w-md">
            <select name="userId" className="h-8 flex-1 rounded-md border bg-background px-2 text-sm">
              {candidates.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <Button type="submit" size="sm"><UserPlus className="size-3.5" /> Add</Button>
          </ActionForm>
        ) : (
          <p className="text-xs text-muted-foreground">Every dev is already a member. Invite more people from your Account page.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Danger zone</h2>
        <ActionButton size="sm" variant="outline" action={archiveWorkspace.bind(null, ws.id, !ws.archivedAt)}>
          {ws.archivedAt ? "Unarchive workspace" : "Archive workspace"}
        </ActionButton>
        <p className="text-xs text-muted-foreground">Archived workspaces are hidden from the sidebar and skipped by the PR poller. Nothing is deleted.</p>
      </section>
    </div>
  );
}
