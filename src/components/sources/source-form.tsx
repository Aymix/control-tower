"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOURCE_KINDS, type SourceKind } from "@/db/schema";
import { addSource } from "@/server/actions/sources";

export const SOURCE_LABEL: Record<SourceKind, string> = { url: "Web page (URL)", notion: "Notion page", confluence: "Confluence page", google_doc: "Google Doc (link-shared)" };

const HINT: Record<SourceKind, string> = {
  url: "Any public web page. Private networks are blocked. HTML is converted to markdown.",
  notion: "Create an internal integration at notion.so/my-integrations, then share the page with it. The token is encrypted at rest.",
  confluence: "Paste the page URL (…/pages/<id>/…). Needs your Atlassian email and an API token from id.atlassian.com.",
  google_doc: "The document must be shared as “Anyone with the link can view”. Exported as plain text.",
};

export function AddSourceDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SourceKind>("url");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" /> Add source</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an external source</DialogTitle>
          <DialogDescription>Snapshotted into the knowledge base as a “source snapshot” document. Re-syncing adds a new version only when the content changed.</DialogDescription>
        </DialogHeader>
        <ActionForm action={addSource.bind(null, workspaceId)} onSuccess={() => setOpen(false)} successMessage="Source added and synced" className="space-y-3">
          {({ pending }) => (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="src-kind">Kind</Label>
                <select id="src-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as SourceKind)} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  {SOURCE_KINDS.map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{HINT[kind]}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="src-ref">{kind === "url" ? "URL" : kind === "google_doc" ? "Document URL" : "Page URL or id"}</Label>
                <Input id="src-ref" name="ref" required placeholder={kind === "url" ? "https://…" : kind === "notion" ? "https://www.notion.so/…" : kind === "confluence" ? "https://acme.atlassian.net/wiki/spaces/ENG/pages/123/…" : "https://docs.google.com/document/d/…/edit"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="src-label">Title in the knowledge base <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="src-label" name="label" placeholder="Defaults to the page title" />
              </div>
              {kind === "notion" || kind === "confluence" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="src-secret">{kind === "notion" ? "Integration token" : "API token"}</Label>
                  <Input id="src-secret" name="secret" type="password" autoComplete="off" required />
                </div>
              ) : null}
              {kind === "confluence" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="src-email">Atlassian email</Label><Input id="src-email" name="email" type="email" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="src-base">Site base <span className="text-muted-foreground">(if using an id)</span></Label><Input id="src-base" name="base" placeholder="https://acme.atlassian.net/wiki" /></div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="src-int">Re-sync every</Label>
                  <select id="src-int" name="syncIntervalMinutes" defaultValue="0" className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                    <option value="0">Manually only</option>
                    <option value="60">Hour</option>
                    <option value="360">6 hours</option>
                    <option value="1440">Day</option>
                    <option value="10080">Week</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm pb-1.5"><Checkbox name="pinned" /> Pin (always in Claude&apos;s context)</label>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Fetching…" : "Add and sync"}</Button>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
