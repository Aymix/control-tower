"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BlockReasonDialog } from "@/components/board/block-reason-dialog";
import type { TaskStatus } from "@/db/schema";
import { STATUS_LABEL, STATUS_ORDER, checkTransition } from "@/lib/tasks/transitions";
import { moveTask } from "@/server/actions/tasks";

export function StatusControl({ taskId, taskNumber, status, role }: { taskId: string; taskNumber: number; status: TaskStatus; role: "owner" | "dev" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blockOpen, setBlockOpen] = useState(false);

  const apply = (to: TaskStatus, reason?: string) =>
    start(async () => {
      const r = await moveTask(taskId, { status: to, blockedReason: reason });
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });

  return (
    <>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value as TaskStatus;
          const check = checkTransition({ from: status, to, role, blockedReason: to === "blocked" ? "pending" : undefined });
          if (!check.ok) {
            toast.error(check.reason);
            e.target.value = status;
            return;
          }
          if (to === "blocked") setBlockOpen(true);
          else apply(to);
        }}
      >
        {STATUS_ORDER.map((s) => {
          const allowed = checkTransition({ from: status, to: s, role, blockedReason: "x" }).ok;
          return (
            <option key={s} value={s} disabled={!allowed}>
              {STATUS_LABEL[s]}
              {!allowed && s === "done" ? " (owner, from In review)" : ""}
            </option>
          );
        })}
      </select>
      <BlockReasonDialog open={blockOpen} taskLabel={`T-${taskNumber}`} onCancel={() => setBlockOpen(false)} onConfirm={(reason) => { setBlockOpen(false); apply("blocked", reason); }} />
    </>
  );
}
