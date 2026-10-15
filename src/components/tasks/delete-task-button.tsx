"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/forms/action-button";
import { deleteTask } from "@/server/actions/tasks";

export function DeleteTaskButton({ taskId, number, slug }: { taskId: string; number: number; slug: string }) {
  const router = useRouter();
  return (
    <ActionButton
      variant="ghost"
      size="sm"
      className="text-destructive"
      action={() => deleteTask(taskId)}
      confirm={`Delete T-${number}? This cannot be undone.`}
      onSuccess={() => router.push(`/w/${slug}/board`)}
    >
      <Trash2 className="size-3.5" /> Delete task
    </ActionButton>
  );
}
