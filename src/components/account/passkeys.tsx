"use client";
import { Fingerprint, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/forms/action-button";
import { TimeAgo } from "@/components/common/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { deletePasskey, renamePasskey } from "@/server/actions/account";

type Pk = { id: string; name: string | null; deviceType: string; backedUp: boolean; createdAt: Date | null };

export function PasskeyList({ passkeys }: { passkeys: Pk[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  return (
    <div className="space-y-3">
      <ul className="rounded-lg border divide-y">
        {passkeys.map((pk) => (
          <li key={pk.id} className="flex items-center gap-3 px-3 py-2">
            <Fingerprint className="size-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              {renaming === pk.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await renamePasskey(pk.id, name);
                    if (r.ok) {
                      setRenaming(null);
                      router.refresh();
                    } else toast.error(r.error);
                  }}
                >
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-7" />
                  <Button size="sm" type="submit">Save</Button>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <div className="text-sm font-medium truncate">{pk.name || "Unnamed passkey"}</div>
                  <div className="text-xs text-muted-foreground">
                    {pk.deviceType === "multiDevice" ? "Synced" : "Device-bound"}
                    {pk.backedUp ? " · backed up" : ""} · added <TimeAgo date={pk.createdAt} />
                  </div>
                </>
              )}
            </div>
            <Button variant="ghost" size="icon" aria-label="Rename" onClick={() => { setRenaming(pk.id); setName(pk.name ?? ""); }}>
              <Pencil className="size-3.5" />
            </Button>
            <ActionButton
              variant="ghost"
              size="icon"
              aria-label="Remove passkey"
              action={() => deletePasskey(pk.id)}
              confirm="Remove this passkey?"
              disabled={passkeys.length <= 1}
              title={passkeys.length <= 1 ? "You cannot remove your last passkey" : "Remove"}
            >
              <Trash2 className="size-3.5" />
            </ActionButton>
          </li>
        ))}
        {passkeys.length === 0 ? (
          <li className="px-3 py-3 text-sm text-destructive">You have no passkey. Add one now or you will be locked out when this session ends.</li>
        ) : null}
      </ul>
      <Button
        variant="outline"
        size="sm"
        disabled={adding}
        onClick={async () => {
          setAdding(true);
          const label = window.prompt("Name this passkey (optional)", "") ?? undefined;
          const r = await authClient.passkey.addPasskey({ name: label || undefined });
          setAdding(false);
          if (r?.error) toast.error(r.error.message ?? "Could not add passkey");
          else {
            toast.success("Passkey added");
            router.refresh();
          }
        }}
      >
        <Fingerprint className="size-4" /> Add a passkey
      </Button>
    </div>
  );
}
