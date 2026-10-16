"use client";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { ActionButton } from "@/components/forms/action-button";
import { syncClaudeMdAction } from "@/server/actions/sources";

export function SyncClaudeMdButton({ repoId, disabled }: { repoId: string; disabled?: boolean }) {
  return (
    <ActionButton<{ status: string; prUrl?: string }>
      size="xs"
      variant="outline"
      disabled={disabled}
      title={disabled ? "Needs a GitHub token with write access" : "Open or update a PR that syncs CLAUDE.md"}
      action={syncClaudeMdAction.bind(null, repoId)}
      onSuccess={(d) => {
        if (d?.status === "unchanged") toast.success("CLAUDE.md is already up to date");
        else if (d?.status === "pr_opened") toast.success("PR opened for CLAUDE.md");
        else toast.success("CLAUDE.md PR updated");
      }}
    >
      <FileText className="size-3.5" /> Sync CLAUDE.md
    </ActionButton>
  );
}
