import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { workspace, workspaceMember, type User, type Workspace } from "@/db/schema";
import { auth } from "@/lib/auth";

export type CurrentUser = Pick<User, "id" | "name" | "email" | "role" | "image">;

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as unknown as CurrentUser;
  return { id: u.id, name: u.name, email: u.email, role: (u.role as "owner" | "dev") ?? "dev", image: u.image ?? null };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Pages: non-owners are sent back to their inbox. Actions should use requireOwnerAction(). */
export async function requireOwner(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "owner") redirect("/inbox");
  return u;
}

export class ForbiddenError extends Error {
  status = 403;
}
export class NotFoundError extends Error {
  status = 404;
}

/** Workspaces visible to the user: all for owner, memberships for devs. */
export async function listAccessibleWorkspaces(u: CurrentUser): Promise<Workspace[]> {
  if (u.role === "owner") {
    return db.query.workspace.findMany({ orderBy: (w, { asc }) => [asc(w.name)] });
  }
  const rows = await db
    .select({ w: workspace })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, u.id))
    .orderBy(workspace.name);
  return rows.map((r) => r.w);
}

export async function canAccessWorkspace(u: CurrentUser, workspaceId: string): Promise<boolean> {
  if (u.role === "owner") return true;
  const m = await db.query.workspaceMember.findFirst({
    where: and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, u.id)),
  });
  return !!m;
}

/** Resolves a workspace by slug and checks access. Throws NotFound when hidden. */
export async function requireWorkspace(u: CurrentUser, slug: string): Promise<Workspace> {
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.slug, slug) });
  if (!ws) throw new NotFoundError("Workspace not found");
  if (!(await canAccessWorkspace(u, ws.id))) throw new NotFoundError("Workspace not found");
  return ws;
}

export async function requireWorkspaceById(u: CurrentUser, id: string): Promise<Workspace> {
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, id) });
  if (!ws) throw new NotFoundError("Workspace not found");
  if (!(await canAccessWorkspace(u, ws.id))) throw new NotFoundError("Workspace not found");
  return ws;
}
