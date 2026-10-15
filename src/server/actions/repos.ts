"use server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { repo } from "@/db/schema";
import { audit } from "@/server/audit";
import { requireOwner, requireUser, requireWorkspaceById } from "@/server/auth";
import { checkRepo, describeGithubError, GithubNotConfigured, octokitFor } from "@/server/github";
import { discoverPullsForRepo } from "@/server/prs/sync";
import { fail, ok, run, type ActionResult } from "./result";

const repoSchema = z.object({
  fullName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use the owner/name form."),
});

export async function addRepo(workspaceId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const ws = await requireWorkspaceById(me, workspaceId);
    const input = repoSchema.parse({ fullName: String(formData.get("fullName") ?? "").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") });
    const [owner, name] = input.fullName.split("/");
    const exists = await db.query.repo.findFirst({ where: and(eq(repo.workspaceId, ws.id), eq(repo.owner, owner), eq(repo.name, name)) });
    if (exists) return fail("This repo is already registered.");

    let defaultBranch = "main";
    let pushAccess: boolean | null = null;
    let checkError: string | null = null;
    try {
      const info = await checkRepo(octokitFor(ws), owner, name);
      defaultBranch = info.defaultBranch;
      pushAccess = info.pushAccess;
    } catch (err) {
      checkError = err instanceof GithubNotConfigured ? "No GitHub token configured; access not checked." : describeGithubError(err);
    }
    const [r] = await db
      .insert(repo)
      .values({ id: randomUUID(), workspaceId: ws.id, owner, name, defaultBranch, pushAccess, checkError, lastCheckedAt: checkError ? null : new Date() })
      .returning();
    await audit({ actorId: me.id, workspaceId: ws.id, action: "repo.added", entityType: "repo", entityId: r.id, meta: { owner, name } });
    if (!checkError) void discoverPullsForRepo(r.id);
    revalidatePath(`/w/${ws.slug}/repos`);
    return ok();
  });
}

export async function removeRepo(repoId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const r = await db.query.repo.findFirst({ where: eq(repo.id, repoId) });
    if (!r) return fail("Repo not found.");
    const ws = await requireWorkspaceById(me, r.workspaceId);
    await db.delete(repo).where(eq(repo.id, r.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "repo.removed", entityType: "repo", entityId: r.id });
    revalidatePath(`/w/${ws.slug}/repos`);
    return ok();
  });
}

export async function recheckRepo(repoId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const r = await db.query.repo.findFirst({ where: eq(repo.id, repoId) });
    if (!r) return fail("Repo not found.");
    const ws = await requireWorkspaceById(me, r.workspaceId);
    try {
      const info = await checkRepo(octokitFor(ws), r.owner, r.name);
      await db
        .update(repo)
        .set({ defaultBranch: info.defaultBranch, pushAccess: info.pushAccess, checkError: null, lastCheckedAt: new Date() })
        .where(eq(repo.id, r.id));
    } catch (err) {
      const msg = err instanceof GithubNotConfigured ? err.message : describeGithubError(err);
      await db.update(repo).set({ checkError: msg, lastCheckedAt: new Date() }).where(eq(repo.id, r.id));
      revalidatePath(`/w/${ws.slug}/repos`);
      return fail(msg);
    }
    const disc = await discoverPullsForRepo(r.id);
    revalidatePath(`/w/${ws.slug}/repos`);
    return disc.error ? fail(disc.error) : ok();
  });
}
