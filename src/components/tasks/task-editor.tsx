"use client";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/common/markdown";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES, type Task } from "@/db/schema";
import { updateTask } from "@/server/actions/tasks";

type Member = { id: string; name: string };

export function TaskEditor({ task, members }: { task: Pick<Task, "id" | "title" | "description" | "priority" | "assigneeId">; members: Member[] }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="group">
        <div className="flex items-start gap-2">
          <h1 className="text-xl font-semibold tracking-tight leading-7 flex-1">{task.title}</h1>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="opacity-70 group-hover:opacity-100">
            <Pencil className="size-3.5" /> Edit
          </Button>
        </div>
        <div className="mt-3">
          {task.description.trim() ? <Markdown>{task.description}</Markdown> : <p className="text-sm text-muted-foreground italic">No description. Click Edit to add context and acceptance criteria.</p>}
        </div>
      </div>
    );
  }
  return (
    <ActionForm action={(fd) => updateTask(task.id, fd)} onSuccess={() => setEditing(false)} successMessage="Task saved" className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={task.title} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description <span className="text-muted-foreground">(markdown)</span></Label>
        <Textarea id="description" name="description" defaultValue={task.description} rows={12} className="font-mono text-[12.5px]" />
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" name="priority" defaultValue={task.priority} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assigneeId">Assignee</Label>
          <select id="assigneeId" name="assigneeId" defaultValue={task.assigneeId ?? ""} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </ActionForm>
  );
}
