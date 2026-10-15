"use server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { invite, passkey, recoveryLink, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { newToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { requireOwner, requireUser } from "@/server/auth";
import { fail, ok, run, type ActionResult } from "./result";

const inviteSchema = z.object({
  label: z.string().trim().max(80).optional(),
  role: z.enum(["owner", "dev"]).default("dev"),
  workspaceIds: z.array(z.string()).default([]),
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export async function createInvite(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const me = await requireOwner();
    const input = inviteSchema.parse({
      label: formData.get("label") || undefined,
      role: formData.get("role") || "dev",
      workspaceIds: formData.getAll("workspaceIds").map(String),
      days: formData.get("days") || 7,
    });
    if (input.role === "owner") return fail("There is exactly one owner. Invite devs only.");
    const { token, hash } = newToken();
    const id = randomUUID();
    await db.insert(invite).values({
      id,
      tokenHash: hash,
      role: input.role,
      label: input.label ?? null,
      workspaceIds: input.workspaceIds,
      createdBy: me.id,
      expiresAt: new Date(Date.now() + input.days * 86_400_000),
    });
    await audit({ actorId: me.id, action: "invite.created", entityType: "invite", entityId: id, meta: { workspaceIds: input.workspaceIds } });
    revalidatePath("/account");
    return ok({ url: `${env().APP_URL}/invite/${token}` });
  });
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    await db.delete(invite).where(eq(invite.id, id));
    await audit({ actorId: me.id, action: "invite.revoked", entityType: "invite", entityId: id });
    revalidatePath("/account");
    return ok();
  });
}

export async function createRecoveryLink(userId: string): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const me = await requireOwner();
    const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
    if (!u) return fail("Unknown user.");
    const { token, hash } = newToken();
    const id = randomUUID();
    await db.insert(recoveryLink).values({ id, tokenHash: hash, userId: u.id, createdBy: me.id, expiresAt: new Date(Date.now() + 86_400_000) });
    await audit({ actorId: me.id, action: "recovery.created", entityType: "user", entityId: u.id });
    return ok({ url: `${env().APP_URL}/recover/${token}` });
  });
}

export async function renamePasskey(passkeyId: string, name: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const pk = await db.query.passkey.findFirst({ where: eq(passkey.id, passkeyId) });
    if (!pk || pk.userId !== me.id) return fail("Passkey not found.");
    await db.update(passkey).set({ name: name.trim().slice(0, 60) || null }).where(eq(passkey.id, pk.id));
    revalidatePath("/account");
    return ok();
  });
}

export async function deletePasskey(passkeyId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const mine = await db.query.passkey.findMany({ where: eq(passkey.userId, me.id) });
    const pk = mine.find((p) => p.id === passkeyId);
    if (!pk) return fail("Passkey not found.");
    if (mine.length <= 1) return fail("You cannot remove your last passkey. Add another one first.");
    await db.delete(passkey).where(eq(passkey.id, pk.id));
    await audit({ actorId: me.id, action: "passkey.deleted", entityType: "passkey", entityId: pk.id });
    revalidatePath("/account");
    return ok();
  });
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return fail("Name is required.");
    await db.update(user).set({ name: name.slice(0, 80), updatedAt: new Date() }).where(eq(user.id, me.id));
    revalidatePath("/", "layout");
    return ok();
  });
}

export async function removeUser(userId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    if (userId === me.id) return fail("You cannot remove yourself.");
    const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
    if (!u) return fail("Unknown user.");
    if (u.role === "owner") return fail("Cannot remove the owner.");
    await db.delete(user).where(eq(user.id, userId));
    await audit({ actorId: me.id, action: "user.removed", entityType: "user", entityId: userId });
    revalidatePath("/account");
    return ok();
  });
}

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
}
