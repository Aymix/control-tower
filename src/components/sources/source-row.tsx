"use client";
import { ExternalLink, KeyRound, Pin, RefreshCw, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { KbSource } from "@/db/schema";
import { removeSource, syncSourceAction, updateSourceSecret, updateSourceSettings } from "@/server/actions/sources";
import { SOURCE_LABEL } from "./source-form";

export function SourceRow({ src, slug, docVersion }: { src: KbSource; slug: string; docVersion: number | null }) {
  const [editing, setEditing] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const interval = src.syncIntervalMinutes;
  const intervalLabel = interval === 0 ? "manual" : interval >= 10080 ? "weekly" : interval >= 1440 ? "daily" : interval >= 360 ? "every 6 h" : "hourly";
  return (
    <li className="px-3 py-2 text-sm space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium flex items-center gap-2 min-w-0">
            {src.pinned ? <Pin className="size-3.5 text-amber-500 shrink-0" /> : null}
            {src.documentId ? <Link href={`/w/${slug}/knowledge/${src.documentId}`} className="truncate hover:underline">{src.label}</Link> : <span className="truncate">{src.label}</span>}
            <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground font-normal shrink-0">{SOURCE_LABEL[src.kind]}</span>
            {docVersion ? <span className="text-xs text-muted-foreground font-normal shrink-0">v{docVersion}</span> : null}
          </div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <a href={src.ref.startsWith("http") ? src.ref : undefined} target="_blank" rel="noreferrer" className="truncate hover:underline">{src.ref}</a>
            <ExternalLink className="size-3 shrink-0" />
            <span className="shrink-0">· {intervalLabel}</span>
            {src.secretLast4 ? <span className="shrink-0">· token ••••{src.secretLast4}</span> : null}
            <span className="shrink-0">· {src.lastSyncedAt ? <>synced <TimeAgo date={src.lastSyncedAt} /></> : "never synced"}</span>
          </div>
          {src.lastError ? <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">{src.lastError}</div> : null}
        </div>
        <ActionButton<{ changed: boolean }> size="icon-xs" variant="ghost" title="Sync now" action={syncSourceAction.bind(null, src.id)} onSuccess={(d) => toast.success(d?.changed ? "Synced: new version saved" : "Synced: no changes")}>
          <RefreshCw className="size-3.5" />
        </ActionButton>
        {src.kind === "notion" || src.kind === "confluence" ? (
          <Button size="icon-xs" variant="ghost" title="Replace token" onClick={() => setTokenOpen((v) => !v)}><KeyRound className="size-3.5" /></Button>
        ) : null}
        <Button size="icon-xs" variant="ghost" title="Settings" onClick={() => setEditing((v) => !v)}><Settings2 className="size-3.5" /></Button>
        <ActionButton size="icon-xs" variant="ghost" title="Remove" action={removeSource.bind(null, src.id, { keepDocument: true })} confirm="Remove this source? The snapshot stays in the knowledge base; archive it there if you no longer need it.">
          <Trash2 className="size-3.5" />
        </ActionButton>
      </div>
      {tokenOpen ? (
        <ActionForm action={updateSourceSecret.bind(null, src.id)} resetOnSuccess successMessage="Token replaced" onSuccess={() => setTokenOpen(false)} className="flex gap-2 max-w-md">
          <Input name="secret" type="password" autoComplete="off" placeholder="New token" required />
          <Button type="submit" size="sm">Save</Button>
        </ActionForm>
      ) : null}
      {editing ? (
        <ActionForm action={updateSourceSettings.bind(null, src.id)} successMessage="Saved" onSuccess={() => setEditing(false)} className="flex flex-wrap items-end gap-3 rounded border p-2">
          <div className="space-y-1 flex-1 min-w-[200px]"><label className="text-xs" htmlFor={`l-${src.id}`}>Title</label><Input id={`l-${src.id}`} name="label" defaultValue={src.label} className="h-8" /></div>
          <div className="space-y-1"><label className="text-xs" htmlFor={`i-${src.id}`}>Re-sync every</label>
            <select id={`i-${src.id}`} name="syncIntervalMinutes" defaultValue={String(interval)} className="h-8 rounded-md border bg-background px-2 text-sm">
              <option value="0">Manually only</option><option value="60">Hour</option><option value="360">6 hours</option><option value="1440">Day</option><option value="10080">Week</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-1.5"><Checkbox name="pinned" defaultChecked={src.pinned} /> Pinned</label>
          <Button type="submit" size="sm">Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </ActionForm>
      ) : null}
    </li>
  );
}
