"use client";
import { KeyRound } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearGithubPat, setGithubPat } from "@/server/actions/workspaces";

export function PatForm({ workspaceId, last4 }: { workspaceId: string; last4: string | null }) {
  return (
    <div className="space-y-3">
      <div className="text-sm flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        {last4 ? (
          <>
            Token stored: <code className="font-mono">••••••••{last4}</code>
            <ActionButton size="xs" variant="ghost" action={() => clearGithubPat(workspaceId)} confirm="Remove the GitHub token? PR polling stops.">Remove</ActionButton>
          </>
        ) : (
          <span className="text-muted-foreground">No token stored.</span>
        )}
      </div>
      <ActionForm action={(fd) => setGithubPat(workspaceId, fd)} resetOnSuccess successMessage="Token saved" className="flex gap-2 max-w-lg">
        <Input name="pat" type="password" autoComplete="off" placeholder={last4 ? "Paste a new token to replace it" : "github_pat_…"} required />
        <Button type="submit" size="sm">{last4 ? "Replace" : "Save"}</Button>
      </ActionForm>
      <p className="text-xs text-muted-foreground">
        Use a fine-grained PAT scoped to this client&apos;s repos: Contents (read/write), Pull requests (read/write), Checks and Commit statuses (read), Metadata (read).
        It is encrypted at rest with AES-256-GCM and never leaves the server; only the last 4 characters are ever shown.
      </p>
    </div>
  );
}
