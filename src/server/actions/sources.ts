"use server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { SOURCE_KINDS, kbDocument, kbSource, repo } from "@/db/schema";
import { encryptSecret, last4 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { requireOwner, requireUser, requireWorkspaceById, type CurrentUser } from "@/server/auth";
import { syncClaudeMd } from "@/server/claude-md";
import { syncSource } from "@/server/sources/sync";
import { fail, ok, run, type ActionResult } from "./result";

const schema = z.object({
  kind: z.enum(SOURCE_KINDS),
  label: z.string().trim().max(120).default(""),
  ref: z.string().trim().min(3).max(2000),
  secret: z.string().trim().max(500).optional(),
  email: z.string().trim().email().optional(),
  base: z.string().trim().url().optional(),
  pinned: z.coerce.boolean().default(false),
  syncIntervalMinutes: z.coerce.number().int().min(0).max(10_080).default(0),
});

export async function addSource(workspaceId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const ws = await requireWorkspaceById(me, workspaceId);
    const input = schema.parse({
      kind: formData.get("kind"),
      label: formData.get("label") ?? "",
      ref: formData.get("ref"),
      secret: formData.get("secret") || undefined,
      email: formData.get("email") || undefined,
      base: formData.get("base") || undefined,
      pinned: formData.get("pinned") === "on",
      syncIntervalMinutes: formData.get("syncIntervalMinutes") || 0,
    });
    if ((input.kind === "notion" || input.kind === "confluence") && !input.secret) return fail("This source needs an API token.");
    if (input.kind === "confluence" && !input.email) return fail("Confluence needs your Atlassian account email.");
    const config: Record<string, string> = {};
    if (input.email) config.email = input.email;
    if (input.base) config.base = input.base;
    const id = randomUUID();
    await db.insert(kbSource).values({
      id,
      workspaceId: ws.id,
      kind: input.kind,
      label: input.label || input.ref.slice(0, 120),
      ref: input.ref,
      config,
      secretEnc: input.secret ? encryptSecret(input.secret, env().MASTER_KEY) : null,
      secretLast4: input.secret ? last4(input.secret) : null,
      pinned: input.pinned,
      syncIntervalMinutes: input.syncIntervalMinutes,
      createdBy: me.id,
    });
    await audit({ actorId: me.id, workspaceId: ws.id, action: "source.added", entityType: "kb_source", entityId: id, meta: { kind: input.kind } });
    const res = await syncSource(id, me.id);
    revalidatePath(`/w/${ws.slug}/knowledge`, "layout");
    return res.ok ? ok() : fail(`Source saved, but the first sync failed: ${res.error}`);
  });
}

async function loadSource(me: CurrentUser, id: string) {
  const src = await db.query.kbSource.findFirst({ where: eq(kbSource.id, id) });
  if (!src) throw new Error("Source not found.");
  const ws = await requireWorkspaceById(me, src.workspaceId);
  return { src, ws };
}

export async function syncSourceAction(id: string): Promise<ActionResult<{ changed: boolean }>> {
  return run(async () => {
    const me = await requireUser();
    const { src, ws } = await loadSource(me, id);
    const res = await syncSource(src.id, me.id);
    revalidatePath(`/w/${ws.slug}/knowledge`, "layout");
    return res.ok ? ok({ changed: res.changed }) : fail(res.error);
  });
}

export async function updateSourceSecret(id: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { src, ws } = await loadSource(me, id);
    const secret = String(formData.get("secret") ?? "").trim();
    if (!secret) return fail("Token is empty.");
    await db.update(kbSource).set({ secretEnc: encryptSecret(secret, env().MASTER_KEY), secretLast4: last4(secret), lastError: null, updatedAt: new Date() }).where(eq(kbSource.id, src.id));
    revalidatePath(`/w/${ws.slug}/knowledge/sources`);
    return ok();
  });
}

export async function updateSourceSettings(id: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { src, ws } = await loadSource(me, id);
    const label = String(formData.get("label") ?? "").trim().slice(0, 120) || src.label;
    const pinned = formData.get("pinned") === "on";
    const interval = Math.max(0, Math.min(10_080, Number.parseInt(String(formData.get("syncIntervalMinutes") ?? "0"), 10) || 0));
    await db.update(kbSource).set({ label, pinned, syncIntervalMinutes: interval, updatedAt: new Date() }).where(eq(kbSource.id, src.id));
    if (src.documentId) await db.update(kbDocument).set({ title: label, pinned, updatedAt: new Date() }).where(eq(kbDocument.id, src.documentId));
    revalidatePath(`/w/${ws.slug}/knowledge`, "layout");
    return ok();
  });
}

export async function removeSource(id: string, opts: { keepDocument: boolean }): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const { src, ws } = await loadSource(me, id);
    await db.delete(kbSource).where(eq(kbSource.id, src.id));
    if (!opts.keepDocument && src.documentId) await db.update(kbDocument).set({ archivedAt: new Date(), pinned: false }).where(eq(kbDocument.id, src.documentId));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "source.removed", entityType: "kb_source", entityId: src.id });
    revalidatePath(`/w/${ws.slug}/knowledge`, "layout");
    return ok();
  });
}

export async function syncClaudeMdAction(repoId: string): Promise<ActionResult<{ status: string; prUrl?: string }>> {
  return run(async () => {
    const me = await requireOwner();
    const r = await db.query.repo.findFirst({ where: eq(repo.id, repoId) });
    if (!r) return fail("Repo not found.");
    const ws = await requireWorkspaceById(me, r.workspaceId);
    const res = await syncClaudeMd(r.id);
    await audit({ actorId: me.id, workspaceId: ws.id, action: "claude_md.synced", entityType: "repo", entityId: r.id, meta: res.ok ? { status: res.status } : { error: res.error } });
    revalidatePath(`/w/${ws.slug}/repos`);
    return res.ok ? ok({ status: res.status, prUrl: res.prUrl }) : fail(res.error);
  });
}
