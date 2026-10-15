"use client";
import { Check, GitMerge, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/common/markdown";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Proposal } from "@/db/schema";
import { acceptProposal, discardProposal, editProposal, mergeProposalIntoTask } from "@/server/actions/proposals";
import { cn } from "@/lib/utils";

export function ProposalCard({ p, slug, isOwner, canSubtask, resultingNumber }: { p: Proposal; slug: string; isOwner: boolean; canSubtask: boolean; resultingNumber: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const decided = p.status !== "pending";

  return (
    <li className={cn("rounded-lg border p-3 space-y-2", decided && "opacity-70")}>
      {editing ? (
        <ActionForm action={(fd) => editProposal(p.id, fd)} onSuccess={() => setEditing(false)} className="space-y-2">
          <div className="space-y-1"><Label>Title</Label><Input name="title" defaultValue={p.title} required /></div>
          <div className="space-y-1"><Label>What to do</Label><Textarea name="body" defaultValue={p.body} rows={4} /></div>
          <div className="space-y-1"><Label>Acceptance criteria</Label><Textarea name="acceptanceCriteria" defaultValue={p.acceptanceCriteria} rows={3} /></div>
          <div className="flex gap-2"><Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </ActionForm>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <span className="font-mono text-[11px] text-muted-foreground mt-1">{p.key}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{p.title}</div>
              {p.dependsOn.length ? <div className="text-xs text-muted-foreground">depends on {p.dependsOn.join(", ")}</div> : null}
            </div>
            <span className={cn("text-[11px] rounded border px-1.5 py-0.5 capitalize", p.status === "accepted" && "border-emerald-500/30 text-emerald-700 dark:text-emerald-300", p.status === "discarded" && "text-muted-foreground", p.status === "merged" && "border-purple-500/30 text-purple-700 dark:text-purple-300")}>
              {p.status}
              {resultingNumber ? <Link href={`/w/${slug}/tasks/${resultingNumber}`} className="ml-1 underline">T-{resultingNumber}</Link> : null}
            </span>
          </div>
          {p.body ? <Markdown className="text-sm">{p.body}</Markdown> : null}
          {p.acceptanceCriteria ? (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2">Acceptance criteria</div>
              <Markdown className="text-sm">{p.acceptanceCriteria}</Markdown>
            </div>
          ) : null}
          {isOwner && !decided ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <ActionButton size="sm" action={() => acceptProposal(p.id)} successMessage="Task created">
                <Check className="size-3.5" /> Accept as task
              </ActionButton>
              {canSubtask ? (
                <ActionButton size="sm" variant="outline" action={() => acceptProposal(p.id, { asSubtask: true })} successMessage="Subtask created">
                  Accept as subtask
                </ActionButton>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Edit</Button>
              {merging ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const n = Number.parseInt(mergeTarget.replace(/^t-?/i, ""), 10);
                    if (!n) return;
                    const r = await mergeProposalIntoTask(p.id, n);
                    if (!r.ok) toast.error(r.error);
                    else {
                      toast.success(`Merged into T-${n}`);
                      setMerging(false);
                      router.refresh();
                    }
                  }}
                >
                  <Input value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} placeholder="T-12" className="h-8 w-20" autoFocus />
                  <Button type="submit" size="sm">Merge</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setMerging(false)}>Cancel</Button>
                </form>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setMerging(true)}><GitMerge className="size-3.5" /> Merge into existing</Button>
              )}
              <ActionButton size="sm" variant="ghost" className="text-muted-foreground ml-auto" action={() => discardProposal(p.id)} confirm="Discard this proposal?">
                <Trash2 className="size-3.5" /> Discard
              </ActionButton>
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
