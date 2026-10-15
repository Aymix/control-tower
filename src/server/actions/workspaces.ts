"use server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { user, workspace, workspaceMember } from "@/db/schema";
import { encryptSecret, last4 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { requireOwner, requireUser, requireWorkspaceById } from "@/server/auth";
import { fail, ok, run, type ActionResult } from "./result";
import { octokitFor } from "@/server/github";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  clientName: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(40).optional(),
});

export async function createWorkspace(formData: FormData): Promise<ActionResult<{ slug: string }>> {
  return run(async () => {
    const me = await requireOwner();
    const input = createSchema.parse({
      name: formData.get("name"),
      clientName: formData.get("clientName"),
      slug: formData.get("slug") || undefined,
    });
    let slug = slugify(input.slug || input.name) || "workspace";
    const clash = await db.query.workspace.findFirst({ where: eq(workspace.slug, slug) });
    if (clash) slug = `${slug}-${randomUUID().slice(0, 4)}`;
    const [ws] = await db
      .insert(workspace)
      .values({ id: randomUUID(), slug, name: input.name, clientName: input.clientName, createdBy: me.id })
      .returning();
    await audit({ actorId: me.id, workspaceId: ws.id, action: "workspace.created", entityType: "workspace", entityId: ws.id });
    revalidatePath("/", "layout");
    redirect(`/w/${ws.slug}`);
  });
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  clientName: z.string().trim().min(1).max(120),
  budget: z.string().trim().optional(),
  defaultModel: z.string().trim().min(1).max(80),
});

export async function updateWorkspace(workspaceId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    const input = updateSchema.parse({
      name: formData.get("name"),
      clientName: formData.get("clientName"),
      budget: formData.get("budget") ?? "",
      defaultModel: formData.get("defaultModel"),
    });
    const budgetCents = input.budget ? Math.round(Number.parseFloat(input.budget) * 100) : null;
    if (input.budget && !Number.isFinite(budgetCents)) return fail("Budget must be a number.");
    await db
      .update(workspace)
      .set({ name: input.name, clientName: input.clientName, budgetCents, defaultModel: input.defaultModel, updatedAt: new Date() })
      .where(eq(workspace.id, ws.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "workspace.updated" });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

export async function setGithubPat(workspaceId: string, formData: FormData): Promise<ActionResult<{ last4: string }>> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    const pat = String(formData.get("pat") ?? "").trim();
    if (pat.length < 20) return fail("That does not look like a GitHub token.");
    // Validate the token before storing it.
    try {
      const octokit = octokitFor({ githubPatEnc: encryptSecret(pat, env().MASTER_KEY) });
      await octokit.rest.rateLimit.get();
    } catch {
      return fail("GitHub rejected this token.");
    }
    await db
      .update(workspace)
      .set({ githubPatEnc: encryptSecret(pat, env().MASTER_KEY), githubPatLast4: last4(pat), githubPollError: null, githubPollErrorAt: null, updatedAt: new Date() })
      .where(eq(workspace.id, ws.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "workspace.pat_set", meta: { last4: last4(pat) } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok({ last4: last4(pat) });
  });
}

export async function clearGithubPat(workspaceId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    await db.update(workspace).set({ githubPatEnc: null, githubPatLast4: null, updatedAt: new Date() }).where(eq(workspace.id, ws.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "workspace.pat_cleared" });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

export async function addMember(workspaceId: string, userId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
    if (!u) return fail("Unknown user.");
    await db.insert(workspaceMember).values({ workspaceId: ws.id, userId }).onConflictDoNothing();
    await audit({ actorId: me.id, workspaceId: ws.id, action: "workspace.member_added", entityType: "user", entityId: userId });
    revalidatePath(`/w/${ws.slug}/settings`);
    return ok();
  });
}

export async function addMemberForm(workspaceId: string, formData: FormData): Promise<ActionResult> {
  return addMember(workspaceId, String(formData.get("userId") ?? ""));
}

export async function removeMember(workspaceId: string, userId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    await db.delete(workspaceMember).where(and(eq(workspaceMember.workspaceId, ws.id), eq(workspaceMember.userId, userId)));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "workspace.member_removed", entityType: "user", entityId: userId });
    revalidatePath(`/w/${ws.slug}/settings`);
    return ok();
  });
}

export async function archiveWorkspace(workspaceId: string, archived: boolean): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    await db.update(workspace).set({ archivedAt: archived ? new Date() : null }).where(eq(workspace.id, ws.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: archived ? "workspace.archived" : "workspace.unarchived" });
    revalidatePath("/", "layout");
    return ok();
  });
}

export async function updateWorkspaceRules(workspaceId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const ws = await requireWorkspaceById(me, workspaceId);
    const rules = String(formData.get("rules") ?? "");
    if (rules.length > 30_000) return fail("Rules are capped at 30,000 characters.");
    await db.update(workspace).set({ rules, updatedAt: new Date() }).where(eq(workspace.id, ws.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "workspace.rules_updated" });
    revalidatePath(`/w/${ws.slug}/rules`);
    return ok();
  });
}
