"use client";
import { Megaphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRIEFING_KINDS, type BriefingKind } from "@/db/schema";
import { KIND_LABEL } from "@/lib/briefings/pack";
import { createBriefingAction } from "@/server/actions/briefings";

const KIND_HINT: Record<BriefingKind, string> = {
  status_update: "What moved, what is in progress, what we need from the client, what is next.",
  pre_task_questions: "Questions the client must answer before a task starts, each with a proposed default.",
  blocker: "What is blocked, why it matters, exactly what we need and by when.",
  release_notes: "User-visible changes from merged PRs, then fixes, then one line of maintenance.",
};

export function NewBriefingDialog({ workspaceId, slug, tasks, hasOnlineRunner, defaultTaskId, defaultKind }: { workspaceId: string; slug: string; tasks: { id: string; number: number; title: string }[]; hasOnlineRunner: boolean; defaultTaskId?: string; defaultKind?: BriefingKind }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BriefingKind>(defaultKind ?? "status_update");
  const router = useRouter();
  const needsTask = kind === "pre_task_questions" || kind === "blocker";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Megaphone className="size-3.5" /> New briefing</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft a briefing</DialogTitle>
          <DialogDescription>Claude drafts it in your voice from the style guide, board, PRs and knowledge base, on your runner. You edit and send it yourself.</DialogDescription>
        </DialogHeader>
        {!hasOnlineRunner ? <p className="text-xs rounded border bg-amber-500/10 px-2 py-1.5">None of your runners is online; the draft will wait until one connects.</p> : null}
        <ActionForm action={(fd) => createBriefingAction(workspaceId, fd)} onSuccess={(d) => { setOpen(false); if (d?.id) router.push(`/w/${slug}/briefings/${d.id}`); }} className="space-y-3">
          {({ pending }) => (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="b-kind">Kind</Label>
                <select id="b-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as BriefingKind)} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  {BRIEFING_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{KIND_HINT[kind]}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-task">Task {needsTask ? "" : <span className="text-muted-foreground">(optional)</span>}</Label>
                <select id="b-task" name="taskId" defaultValue={defaultTaskId ?? ""} required={needsTask} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">{needsTask ? "Pick a task…" : "Whole workspace"}</option>
                  {tasks.map((t) => <option key={t.id} value={t.id}>T-{t.number} {t.title}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-instr">Anything specific to say? <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="b-instr" name="instructions" rows={4} placeholder="e.g. Launch moved to the 20th; ask them to confirm the sandbox keys by Friday." />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>Draft it</Button>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
