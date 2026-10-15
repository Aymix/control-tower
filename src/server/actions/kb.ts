"use server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { KB_KINDS, kbDocument, kbVersion } from "@/db/schema";
import { audit } from "@/server/audit";
import { requireUser, requireWorkspaceById } from "@/server/auth";
import { fail, ok, run, type ActionResult } from "./result";

const docSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(KB_KINDS),
  content: z.string().max(200_000),
});

export async function createDocument(workspaceId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const ws = await requireWorkspaceById(me, workspaceId);
    const input = docSchema.parse({ title: formData.get("title"), kind: formData.get("kind"), content: formData.get("content") ?? "" });
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(kbDocument).values({ id, workspaceId: ws.id, kind: input.kind, title: input.title, createdBy: me.id });
      await tx.insert(kbVersion).values({ id: randomUUID(), documentId: id, version: 1, content: input.content, createdBy: me.id });
    });
    await audit({ actorId: me.id, workspaceId: ws.id, action: "kb.created", entityType: "kb_document", entityId: id });
    revalidatePath(`/w/${ws.slug}/knowledge`);
    redirect(`/w/${ws.slug}/knowledge/${id}`);
  });
}

export async function updateDocument(documentId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const doc = await db.query.kbDocument.findFirst({ where: eq(kbDocument.id, documentId) });
    if (!doc) return fail("Document not found.");
    const ws = await requireWorkspaceById(me, doc.workspaceId);
    const input = docSchema.parse({ title: formData.get("title"), kind: formData.get("kind"), content: formData.get("content") ?? "" });
    const note = String(formData.get("note") ?? "").trim() || null;
    const next = doc.currentVersion + 1;
    await db.transaction(async (tx) => {
      await tx.insert(kbVersion).values({ id: randomUUID(), documentId: doc.id, version: next, content: input.content, note, createdBy: me.id });
      await tx
        .update(kbDocument)
        .set({ title: input.title, kind: input.kind, currentVersion: next, updatedAt: new Date() })
        .where(eq(kbDocument.id, doc.id));
    });
    await audit({ actorId: me.id, workspaceId: ws.id, action: "kb.updated", entityType: "kb_document", entityId: doc.id, meta: { version: next } });
    revalidatePath(`/w/${ws.slug}/knowledge`, "layout");
    return ok();
  });
}

export async function setDocumentPinned(documentId: string, pinned: boolean): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const doc = await db.query.kbDocument.findFirst({ where: eq(kbDocument.id, documentId) });
    if (!doc) return fail("Document not found.");
    const ws = await requireWorkspaceById(me, doc.workspaceId);
    await db.update(kbDocument).set({ pinned, updatedAt: new Date() }).where(eq(kbDocument.id, doc.id));
    revalidatePath(`/w/${ws.slug}/knowledge`, "layout");
    return ok();
  });
}

export async function setDocumentArchived(documentId: string, archived: boolean): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const doc = await db.query.kbDocument.findFirst({ where: eq(kbDocument.id, documentId) });
    if (!doc) return fail("Document not found.");
    const ws = await requireWorkspaceById(me, doc.workspaceId);
    await db.update(kbDocument).set({ archivedAt: archived ? new Date() : null, pinned: archived ? false : doc.pinned, updatedAt: new Date() }).where(eq(kbDocument.id, doc.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: archived ? "kb.archived" : "kb.unarchived", entityType: "kb_document", entityId: doc.id });
    revalidatePath(`/w/${ws.slug}/knowledge`, "layout");
    return ok();
  });
}
