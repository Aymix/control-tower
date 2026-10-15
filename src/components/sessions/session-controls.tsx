"use client";
import { OctagonX, Send, Square } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SessionStatus } from "@/db/schema";
import { endSession, interruptSession, sendSessionMessage } from "@/server/actions/sessions";
import { Transcript, type StatusSnapshot, type TranscriptEvent } from "./transcript";

export function SessionView({ sessionId, initialEvents, initialStatus }: { sessionId: string; initialEvents: TranscriptEvent[]; initialStatus: StatusSnapshot }) {
  const [status, setStatus] = useState<SessionStatus>(initialStatus.status);
  const live = status === "running" || status === "starting" || status === "claimed";
  const ended = status === "completed" || status === "failed";
  return (
    <div className="flex flex-col gap-3 min-h-[60vh]">
      <div className="flex-1 min-h-0 rounded-lg border p-3 max-h-[65vh] flex flex-col">
        <Transcript sessionId={sessionId} initialEvents={initialEvents} initialStatus={initialStatus} onStatus={(s) => setStatus(s.status)} />
      </div>
      {!ended ? (
        <ActionForm action={(fd) => sendSessionMessage(sessionId, fd)} resetOnSuccess className="flex gap-2 items-end">
          <Textarea name="body" rows={2} className="flex-1" placeholder={live ? "Steer Claude mid-run (delivered at the next turn)…" : status === "queued" ? "Queue a message for when the session starts…" : "Follow-up: resumes the session on the same runner…"} />
          <div className="flex flex-col gap-1">
            <Button type="submit" size="sm"><Send className="size-3.5" /> Send</Button>
            {live ? (
              <ActionButton size="sm" variant="outline" action={() => interruptSession(sessionId)} successMessage="Interrupt requested"><Square className="size-3.5" /> Interrupt</ActionButton>
            ) : null}
            <ActionButton size="sm" variant="ghost" className="text-muted-foreground" action={() => endSession(sessionId)} confirm="End this session? It cannot be resumed afterwards."><OctagonX className="size-3.5" /> End</ActionButton>
          </div>
        </ActionForm>
      ) : (
        <p className="text-xs text-muted-foreground">This session has ended. Start a new one from the task page.</p>
      )}
    </div>
  );
}
