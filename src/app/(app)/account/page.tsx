import { desc, eq, gt, isNull, and } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { RecoveryLinkButton, InviteManager } from "@/components/account/invites";
import { PasskeyList } from "@/components/account/passkeys";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeAgo } from "@/components/common/time";
import { db } from "@/db";
import { invite, passkey, workspace } from "@/db/schema";
import { removeUser, updateProfile } from "@/server/actions/account";
import { requireUser } from "@/server/auth";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const me = await requireUser();
  const passkeys = await db.query.passkey.findMany({ where: eq(passkey.userId, me.id), orderBy: [desc(passkey.createdAt)] });
  const isOwner = me.role === "owner";
  const [invites, users, workspaces] = isOwner
    ? await Promise.all([
        db.query.invite.findMany({ where: and(isNull(invite.usedAt), gt(invite.expiresAt, new Date())), orderBy: [desc(invite.createdAt)] }),
        db.query.user.findMany({ orderBy: (u, { asc }) => [asc(u.createdAt)], with: { passkeys: { columns: { id: true } }, memberships: { with: { workspace: { columns: { name: true } } } } } }),
        db.query.workspace.findMany({ where: isNull(workspace.archivedAt), orderBy: (w, { asc }) => [asc(w.name)] }),
      ])
    : [[], [], []];

  return (
    <div className="p-5 max-w-3xl space-y-8">
      <PageHeader title="Account" description="Your profile and the passkeys you sign in with." />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Profile</h2>
        <ActionForm action={updateProfile} successMessage="Profile saved" className="flex gap-2 items-end max-w-md">
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" name="name" defaultValue={me.name} />
          </div>
          <Button type="submit" size="sm">Save</Button>
        </ActionForm>
        <p className="text-xs text-muted-foreground">Role: <span className="capitalize">{me.role}</span></p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Passkeys</h2>
        <p className="text-xs text-muted-foreground">Register one per device. You cannot remove your last passkey.</p>
        <PasskeyList passkeys={passkeys.map((p) => ({ id: p.id, name: p.name, deviceType: p.deviceType, backedUp: p.backedUp, createdAt: p.createdAt }))} />
      </section>

      <section className="space-y-3" id="runners">
        <h2 className="text-sm font-semibold">Runners</h2>
        <p className="text-sm text-muted-foreground">
          Claude sessions run on your own machine, on your Claude subscription. Runner tokens arrive in phase 2.
        </p>
      </section>

      {isOwner ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Invite links</h2>
            <p className="text-xs text-muted-foreground">Invite devs with a one-time link. Share it off-channel; it is never emailed.</p>
            <InviteManager invites={invites} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Team</h2>
            <ul className="rounded-lg border divide-y">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {u.name} <span className="text-[11px] rounded border px-1.5 text-muted-foreground capitalize">{u.role}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.passkeys.length} passkey{u.passkeys.length === 1 ? "" : "s"} · joined <TimeAgo date={u.createdAt} />
                      {u.memberships.length ? ` · ${u.memberships.map((m) => m.workspace.name).join(", ")}` : u.role === "dev" ? " · no workspaces" : ""}
                    </div>
                  </div>
                  <RecoveryLinkButton userId={u.id} />
                  {u.id !== me.id && u.role !== "owner" ? (
                    <ActionButton variant="ghost" size="icon" aria-label="Remove user" action={removeUser.bind(null, u.id)} confirm={`Remove ${u.name}? Their comments stay, their account is deleted.`}>
                      <Trash2 className="size-3.5" />
                    </ActionButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
