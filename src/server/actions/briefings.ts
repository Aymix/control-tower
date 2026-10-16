"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { BRIEFING_KINDS, briefing } from "@/db/schema";
import { audit } from "@/server/audit";
import { requireOwner, requireWorkspaceById } from "@/server/auth";
import { createBriefing, discardBriefing, markBriefingSent, regenerateBriefing, saveFinalText } from "@/server/briefings/service";
import { fail, ok, run, type ActionResult } from "./result";

const createSchema = z.object({
  kind: z.enum(BRIEFING_KINDS),
  taskId: z.string().optional(),
  instructions: z.string().max(20_000).default(""),
});

export async function createBriefingAction(workspaceId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    const input = createSchema.parse({ kind: formData.get("kind"), taskId: formData.get("taskId") || undefined, instructions: formData.get("instructions") ?? "" });
    const b = await createBriefing({ workspaceId: ws.id, kind: input.kind, taskId: input.taskId ?? null, instructions: input.instructions, createdBy: me.id });
    await audit({ actorId: me.id, workspaceId: ws.id, action: "briefing.created", entityType: "briefing", entityId: b.id, meta: { kind: b.kind } });
    revalidatePath(`/w/${ws.slug}/briefings`);
    return ok({ id: b.id });
  });
}

async function load(id: string) {
  const me = await requireOwner();
  const b = await db.query.briefing.findFirst({ where: eq(briefing.id, id) });
  if (!b) throw new Error("Briefing not found.");
  const ws = await requireWorkspaceById(me, b.workspaceId);
  return { me, b, ws };
}

export async function saveBriefingText(id: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const { b, ws } = await load(id);
    await saveFinalText(b.id, String(formData.get("finalText") ?? ""));
    revalidatePath(`/w/${ws.slug}/briefings/${b.id}`);
    return ok();
  });
}

export async function markBriefingSentAction(id: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const { me, b, ws } = await load(id);
    if (b.status !== "draft") return fail("Only drafts can be marked as sent.");
    const finalText = String(formData.get("finalText") ?? "");
    const sentVia = String(formData.get("sentVia") ?? "").trim() || null;
    await markBriefingSent(b.id, finalText, sentVia);
    await audit({ actorId: me.id, workspaceId: ws.id, action: "briefing.sent", entityType: "briefing", entityId: b.id, meta: { edited: b.draft?.trim() !== finalText.trim() } });
    revalidatePath(`/w/${ws.slug}/briefings`, "layout");
    return ok();
  });
}

export async function discardBriefingAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const { me, b, ws } = await load(id);
    await discardBriefing(b.id);
    await audit({ actorId: me.id, workspaceId: ws.id, action: "briefing.discarded", entityType: "briefing", entityId: b.id });
    revalidatePath(`/w/${ws.slug}/briefings`, "layout");
    return ok();
  });
}

export async function regenerateBriefingAction(id: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const { me, b, ws } = await load(id);
    if (b.status === "sent") return fail("This briefing was already sent.");
    await regenerateBriefing(b.id, String(formData.get("feedback") ?? ""), me.id);
    await audit({ actorId: me.id, workspaceId: ws.id, action: "briefing.regenerated", entityType: "briefing", entityId: b.id });
    revalidatePath(`/w/${ws.slug}/briefings/${b.id}`);
    return ok();
  });
}
