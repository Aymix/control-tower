"use client";
import { Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/common/copy-button";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInvite, createRecoveryLink, revokeInvite } from "@/server/actions/account";

type Invite = { id: string; label: string | null; workspaceIds: string[]; expiresAt: Date; createdAt: Date };
type Ws = { id: string; name: string };

export function InviteManager({ invites, workspaces }: { invites: Invite[]; workspaces: Ws[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? "?";
  return (
    <div className="space-y-4">
      <ActionForm
        action={createInvite}
        resetOnSuccess
        onSuccess={(d) => setUrl(d?.url ?? null)}
        className="rounded-lg border p-3 space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div className="space-y-1.5">
            <Label htmlFor="inv-label">Label</Label>
            <Input id="inv-label" name="label" placeholder="e.g. Sara (frontend)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-days">Valid for (days)</Label>
            <Input id="inv-days" name="days" type="number" min={1} max={30} defaultValue={7} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Workspace access</Label>
          <div className="flex flex-wrap gap-3">
            {workspaces.length === 0 ? <span className="text-xs text-muted-foreground">No workspaces yet; you can add members later.</span> : null}
            {workspaces.map((w) => (
              <label key={w.id} className="flex items-center gap-2 text-sm">
                <Checkbox name="workspaceIds" value={w.id} /> {w.name}
              </label>
            ))}
          </div>
        </div>
        <input type="hidden" name="role" value="dev" />
        <Button type="submit" size="sm">
          <Link2 className="size-4" /> Create invite link
        </Button>
      </ActionForm>
      {url ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="font-medium mb-1">Share this link off-channel. It is shown only once.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs">{url}</code>
            <CopyButton value={url} />
          </div>
        </div>
      ) : null}
      {invites.length ? (
        <ul className="rounded-lg border divide-y">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{i.label || "Untitled invite"}</div>
                <div className="text-xs text-muted-foreground">
                  {i.workspaceIds.length ? i.workspaceIds.map(wsName).join(", ") : "No workspaces"} · expires <TimeAgo date={i.expiresAt} />
                </div>
              </div>
              <ActionButton variant="ghost" size="icon" aria-label="Revoke" action={() => revokeInvite(i.id)} confirm="Revoke this invite?">
                <Trash2 className="size-3.5" />
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No pending invites.</p>
      )}
    </div>
  );
}

export function RecoveryLinkButton({ userId }: { userId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  return url ? (
    <div className="flex items-center gap-2">
      <code className="text-xs truncate max-w-[260px]">{url}</code>
      <CopyButton value={url} size="xs" />
    </div>
  ) : (
    <ActionButton size="xs" variant="outline" action={() => createRecoveryLink(userId)} onSuccess={(d) => setUrl(d?.url ?? null)}>
      Recovery link
    </ActionButton>
  );
}
