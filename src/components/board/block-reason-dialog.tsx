"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function BlockReasonDialog({
  open,
  taskLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  taskLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block {taskLabel}</DialogTitle>
          <DialogDescription>Say what is blocking this task. The reason is shown on the card and in the owner&apos;s inbox.</DialogDescription>
        </DialogHeader>
        <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Waiting on staging credentials from the client" rows={3} />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); setReason(""); }}>
            Block task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
