"use client";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/common/markdown";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Briefing } from "@/db/schema";
import { discardBriefingAction, markBriefingSentAction, regenerateBriefingAction, saveBriefingText } from "@/server/actions/briefings";

export function BriefingEditor({ briefing }: { briefing: Briefing }) {
  const router = useRouter();
  const [text, setText] = useState(briefing.finalText ?? briefing.draft ?? "");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [feedback, setFeedback] = useState("");
  const dirty = useRef(false);
  const working = briefing.status === "queued" || briefing.status === "drafting";

  // Poll while drafting so the draft appears without a manual reload.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [working, router]);
  useEffect(() => {
    if (!dirty.current) setText(briefing.finalText ?? briefing.draft ?? "");
  }, [briefing.finalText, briefing.draft]);

  if (working) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground flex items-center gap-2">
        <RefreshCw className="size-4 animate-spin" /> {briefing.status === "queued" ? "Waiting for your runner…" : "Claude is drafting…"} {briefing.sessionId ? <a className="underline" href={`../sessions/${briefing.sessionId}`}>watch the session</a> : null}
      </div>
    );
  }
  if (briefing.status === "failed") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-red-500/10 p-3 text-sm">Drafting failed: {briefing.error ?? "unknown error"}</div>
        <ActionForm action={(fd) => regenerateBriefingAction(briefing.id, fd)} className="flex gap-2"><Button type="submit" size="sm"><RefreshCw className="size-3.5" /> Try again</Button></ActionForm>
      </div>
    );
  }
  const sent = briefing.status === "sent";
  const edited = (briefing.draft ?? "").trim() !== text.trim();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5">
          <Button size="xs" variant={tab === "edit" ? "secondary" : "ghost"} onClick={() => setTab("edit")}>Edit</Button>
          <Button size="xs" variant={tab === "preview" ? "secondary" : "ghost"} onClick={() => setTab("preview")}>Preview</Button>
        </div>
        {edited && !sent ? <span className="text-xs text-muted-foreground">edited from the draft (your edits teach the next drafts)</span> : null}
        <Button size="xs" variant="outline" className="ml-auto" onClick={async () => { await navigator.clipboard.writeText(text); toast.success("Copied"); }}><Copy className="size-3.5" /> Copy</Button>
      </div>
      {tab === "edit" ? (
        <Textarea value={text} readOnly={sent} onChange={(e) => { dirty.current = true; setText(e.target.value); }} rows={22} className="font-sans text-[13.5px] leading-6" />
      ) : (
        <div className="rounded-lg border p-4 min-h-[300px]"><Markdown>{text}</Markdown></div>
      )}
      {!sent ? (
        <div className="flex flex-wrap items-start gap-3">
          <ActionForm action={(fd) => { fd.set("finalText", text); return saveBriefingText(briefing.id, fd); }} successMessage="Saved">
            <Button type="submit" size="sm" variant="outline">Save edits</Button>
          </ActionForm>
          <ActionForm
            action={(fd) => { fd.set("finalText", text); return markBriefingSentAction(briefing.id, fd); }}
            successMessage="Marked as sent"
            onSuccess={() => { dirty.current = false; }}
            className="flex items-end gap-2"
          >
            <div className="space-y-1"><Label htmlFor="sentVia" className="text-xs">Sent via</Label><Input id="sentVia" name="sentVia" placeholder="email / Slack / call" className="h-8 w-40" /></div>
            <Button type="submit" size="sm"><Check className="size-3.5" /> I sent this</Button>
          </ActionForm>
          <details className="w-full">
            <summary className="text-sm cursor-pointer text-muted-foreground">Regenerate with feedback</summary>
            <ActionForm action={(fd) => regenerateBriefingAction(briefing.id, fd)} className="mt-2 flex gap-2 items-start">
              <Textarea name="feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Shorter. Lead with the launch date. Drop the bullet about CI." className="flex-1" />
              <Button type="submit" size="sm" variant="outline"><RefreshCw className="size-3.5" /> Redraft</Button>
            </ActionForm>
          </details>
          <ActionButton size="sm" variant="ghost" className="text-muted-foreground ml-auto" action={() => discardBriefingAction(briefing.id)} confirm="Discard this briefing?"><Trash2 className="size-3.5" /> Discard</ActionButton>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sent {briefing.sentAt?.toLocaleString()}{briefing.sentVia ? ` via ${briefing.sentVia}` : ""}.</p>
      )}
    </div>
  );
}
