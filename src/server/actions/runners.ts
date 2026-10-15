"use server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { runnerToken } from "@/db/schema";
import { hashToken, last4, newToken } from "@/lib/crypto";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth";
import { fail, ok, run, type ActionResult } from "./result";

export async function createRunnerToken(formData: FormData): Promise<ActionResult<{ token: string }>> {
  return run(async () => {
    const me = await requireUser();
    const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "My runner";
    const { token } = newToken(32);
    const full = `ctr_${token}`;
    const id = randomUUID();
    await db.insert(runnerToken).values({ id, userId: me.id, name, tokenHash: hashToken(full), last4: last4(full) });
    await audit({ actorId: me.id, action: "runner.token_created", entityType: "runner_token", entityId: id });
    revalidatePath("/account");
    return ok({ token: full });
  });
}

export async function revokeRunnerToken(id: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const row = await db.query.runnerToken.findFirst({ where: and(eq(runnerToken.id, id), eq(runnerToken.userId, me.id)) });
    if (!row) return fail("Runner not found.");
    await db.update(runnerToken).set({ revokedAt: new Date() }).where(eq(runnerToken.id, id));
    await audit({ actorId: me.id, action: "runner.token_revoked", entityType: "runner_token", entityId: id });
    revalidatePath("/account");
    return ok();
  });
}
