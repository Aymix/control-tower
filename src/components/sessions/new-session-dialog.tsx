"use client";
import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSessionAction } from "@/server/actions/sessions";

export function NewSessionDialog({
  taskId,
  slug,
  kind,
  defaultModel,
  repos,
  hasOnlineRunner,
  disabled,
}: {
  taskId: string;
  slug: string;
  kind: "planning" | "implementation";
  defaultModel: string;
  repos: { id: string; owner: string; name: string }[];
  hasOnlineRunner: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const planning = kind === "planning";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={planning ? "outline" : "default"} disabled={disabled}>
          <Bot className="size-3.5" /> {planning ? "Plan with Claude" : "Implement with Claude"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{planning ? "Planning session" : "Implementation session"}</DialogTitle>
          <DialogDescription>
            {planning
              ? "Read-only: Claude studies the repo and hands back a plan with task proposals."
              : "Claude works on a session branch, commits, pushes and opens a PR. Guards block force pushes and the default branch."}
            {" "}Runs on your own runner and Claude subscription.
          </DialogDescription>
        </DialogHeader>
        {!hasOnlineRunner ? (
          <p className="text-xs rounded border bg-amber-500/10 px-2 py-1.5">
            None of your runners is online. The session will queue until one connects (Account → Runners).
          </p>
        ) : null}
        <ActionForm
          action={(fd) => createSessionAction(taskId, fd)}
          onSuccess={(d) => {
            setOpen(false);
            if (d?.id) router.push(`/w/${slug}/sessions/${d.id}`);
          }}
          className="space-y-3"
        >
          {({ pending }) => (
            <>
              <input type="hidden" name="kind" value={kind} />
              <div className="space-y-1.5">
                <Label htmlFor="s-instr">Instruction</Label>
                <Textarea id="s-instr" name="instruction" rows={5} required autoFocus placeholder={planning ? "What should the plan cover? Constraints, open questions, things to verify…" : "What to implement, how to test, anything the task description leaves out…"} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="s-model">Model</Label>
                  <Input id="s-model" name="model" defaultValue={defaultModel} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-budget">Max budget (USD, estimated)</Label>
                  <Input id="s-budget" name="maxBudgetUsd" type="number" step="0.5" min="0.5" placeholder="none" />
                </div>
              </div>
              {repos.length > 1 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="s-repo">Repository</Label>
                  <select id="s-repo" name="repoId" className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                    {repos.map((r) => (
                      <option key={r.id} value={r.id}>{r.owner}/{r.name}</option>
                    ))}
                  </select>
                </div>
              ) : repos.length === 0 ? (
                <p className="text-xs text-muted-foreground">No repository registered: the session runs in an empty directory (fine for planning from the task text only).</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>Start session</Button>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
