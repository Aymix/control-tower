"use client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES } from "@/db/schema";
import { createTask } from "@/server/actions/tasks";

type Member = { id: string; name: string };

export function NewTaskDialog({
  workspaceId,
  slug,
  members,
  parentId,
  trigger,
  defaultAssigneeId,
}: {
  workspaceId: string;
  slug: string;
  members: Member[];
  parentId?: string;
  trigger?: React.ReactNode;
  defaultAssigneeId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" /> {parentId ? "Add subtask" : "New task"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{parentId ? "New subtask" : "New task"}</DialogTitle>
        </DialogHeader>
        <ActionForm
          action={(fd) => createTask(workspaceId, fd)}
          onSuccess={(d) => {
            setOpen(false);
            if (d && !parentId) router.push(`/w/${slug}/tasks/${d.number}`);
          }}
          className="space-y-3"
        >
          {({ pending }) => (
            <>
              {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
              <div className="space-y-1.5">
                <Label htmlFor="t-title">Title</Label>
                <Input id="t-title" name="title" required autoFocus placeholder="Short, imperative: Add rate limiting to /api/login" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-desc">Description <span className="text-muted-foreground">(markdown)</span></Label>
                <Textarea id="t-desc" name="description" rows={6} placeholder="Context, scope, acceptance criteria…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-prio">Priority</Label>
                  <select id="t-prio" name="priority" defaultValue="medium" className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-assignee">Assignee</Label>
                  <select id="t-assignee" name="assigneeId" defaultValue={defaultAssigneeId ?? ""} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>Create</Button>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
