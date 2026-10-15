"use client";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KB_KINDS, type KbKind } from "@/db/schema";
import type { ActionResult } from "@/server/actions/result";

export const KIND_LABEL: Record<KbKind, string> = {
  scope: "Scope",
  architecture: "Architecture",
  decisions: "Decisions",
  meeting_notes: "Meeting notes",
  plan: "Plan",
  source_snapshot: "Source snapshot",
};

export function DocForm({
  action,
  defaults,
  submitLabel,
  showNote,
  cancelHref,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  defaults?: { title: string; kind: KbKind; content: string };
  submitLabel: string;
  showNote?: boolean;
  cancelHref?: string;
}) {
  const router = useRouter();
  return (
    <ActionForm action={action} className="space-y-3" onSuccess={() => cancelHref && router.push(cancelHref)}>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="space-y-1.5">
          <Label htmlFor="d-title">Title</Label>
          <Input id="d-title" name="title" defaultValue={defaults?.title} required placeholder="Scope: Phase 1 checkout" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-kind">Kind</Label>
          <select id="d-kind" name="kind" defaultValue={defaults?.kind ?? "scope"} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
            {KB_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="d-content">Content <span className="text-muted-foreground">(markdown)</span></Label>
        <Textarea id="d-content" name="content" defaultValue={defaults?.content} rows={22} className="font-mono text-[12.5px] leading-5" />
      </div>
      {showNote ? (
        <div className="space-y-1.5 max-w-md">
          <Label htmlFor="d-note">Version note <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="d-note" name="note" placeholder="What changed" />
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm">{submitLabel}</Button>
        {cancelHref ? <Button asChild type="button" size="sm" variant="ghost"><a href={cancelHref}>Cancel</a></Button> : null}
      </div>
    </ActionForm>
  );
}
