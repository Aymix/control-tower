import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { kbDocument, kbSource, kbVersion, workspace, type KbSource } from "@/db/schema";
import { fetchSource, SourceFetchError } from "./fetch";

const KIND_LABEL = { url: "Web page", notion: "Notion", confluence: "Confluence", google_doc: "Google Doc" } as const;

function header(src: KbSource, title: string | null, sourceUrl: string | null) {
  return `> **Source snapshot** · ${KIND_LABEL[src.kind]}${sourceUrl ? ` · [open original](${sourceUrl})` : ""} · synced ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC${title ? `\n>\n> ${title}` : ""}\n\n`;
}

/** Fetches one source and writes a new KB version when the content changed. */
export async function syncSource(sourceId: string, actorId: string | null = null): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const src = await db.query.kbSource.findFirst({ where: eq(kbSource.id, sourceId) });
  if (!src) return { ok: false, error: "Source not found." };
  try {
    const fetched = await fetchSource(src);
    const body = fetched.markdown.trim();
    if (!body) throw new SourceFetchError("The document is empty after conversion.");
    const hash = createHash("sha256").update(body).digest("hex");
    const title = src.label || fetched.title || src.ref;
    let changed = false;
    let docId = src.documentId;
    const doc = docId ? await db.query.kbDocument.findFirst({ where: eq(kbDocument.id, docId) }) : null;
    if (!doc) {
      docId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(kbDocument).values({ id: docId!, workspaceId: src.workspaceId, kind: "source_snapshot", title: title.slice(0, 200), pinned: src.pinned, createdBy: actorId ?? src.createdBy });
        await tx.insert(kbVersion).values({ id: randomUUID(), documentId: docId!, version: 1, content: header(src, fetched.title, fetched.sourceUrl) + body, note: "Initial snapshot", createdBy: actorId });
      });
      changed = true;
    } else if (hash !== src.contentHash) {
      const next = doc.currentVersion + 1;
      await db.transaction(async (tx) => {
        await tx.insert(kbVersion).values({ id: randomUUID(), documentId: doc.id, version: next, content: header(src, fetched.title, fetched.sourceUrl) + body, note: "Re-synced from source", createdBy: actorId });
        await tx.update(kbDocument).set({ currentVersion: next, updatedAt: new Date(), pinned: src.pinned, archivedAt: null }).where(eq(kbDocument.id, doc.id));
      });
      changed = true;
    }
    await db.update(kbSource).set({ documentId: docId, contentHash: hash, lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(kbSource.id, src.id));
    return { ok: true, changed };
  } catch (err) {
    const msg = err instanceof SourceFetchError ? err.message : (err as Error).message ?? String(err);
    await db.update(kbSource).set({ lastError: msg, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(kbSource.id, src.id));
    return { ok: false, error: msg };
  }
}

/** Worker: sources with an interval whose last sync is older than that interval. */
export async function syncDueSources(): Promise<{ due: number; changed: number; errors: string[] }> {
  const rows = await db
    .select({ id: kbSource.id, label: kbSource.label })
    .from(kbSource)
    .innerJoin(workspace, eq(workspace.id, kbSource.workspaceId))
    .where(
      and(
        isNull(workspace.archivedAt),
        sql`${kbSource.syncIntervalMinutes} > 0`,
        or(isNull(kbSource.lastSyncedAt), lte(kbSource.lastSyncedAt, sql`now() - (${kbSource.syncIntervalMinutes} * interval '1 minute')`)),
      ),
    )
    .limit(25);
  let changed = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const res = await syncSource(r.id);
    if (res.ok && res.changed) changed++;
    if (!res.ok) errors.push(`${r.label}: ${res.error}`);
  }
  return { due: rows.length, changed, errors };
}
