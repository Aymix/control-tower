import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { invite, recoveryLink, user, workspaceMember } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { devLoginEnabled, env, isProd } from "@/lib/env";
import { audit } from "@/server/audit";

/**
 * Control Tower onboarding endpoints. All of them create a Better Auth
 * session and set the cookie, so the new user can register a passkey next.
 *
 *  POST /api/auth/tower/setup    { name, email?, token? }  — first owner only
 *  POST /api/auth/tower/invite   { token, name, email? }    — redeem invite
 *  POST /api/auth/tower/recover  { token }                  — session for a locked-out user
 *  POST /api/auth/dev/login      { userId }                 — DEV_LOGIN=1 and not production
 */
export const towerPlugin = () =>
  ({
    id: "tower",
    endpoints: {
      towerSetup: createAuthEndpoint(
        "/tower/setup",
        {
          method: "POST",
          body: z.object({
            name: z.string().trim().min(1).max(80),
            email: z.string().trim().email().optional(),
            token: z.string().optional(),
          }),
        },
        async (ctx) => {
          const existingOwner = await db.query.user.findFirst({ where: eq(user.role, "owner") });
          if (existingOwner) throw new APIError("CONFLICT", { message: "Setup already completed." });
          if (isProd()) {
            const expected = env().SETUP_TOKEN;
            if (!expected || ctx.body.token !== expected) {
              throw new APIError("FORBIDDEN", { message: "Invalid setup token." });
            }
          }
          const created = await ctx.context.internalAdapter.createUser({
            name: ctx.body.name,
            email: ctx.body.email ?? placeholderEmail(ctx.body.name),
            emailVerified: false,
            role: "owner",
            createdAt: new Date(),
            updatedAt: new Date(),
          }, { method: "tower" });
          const session = await ctx.context.internalAdapter.createSession(created.id);
          await setSessionCookie(ctx, { session, user: created });
          await audit({ actorId: created.id, action: "setup.owner_created", entityType: "user", entityId: created.id });
          return ctx.json({ userId: created.id });
        },
      ),

      towerInvite: createAuthEndpoint(
        "/tower/invite",
        {
          method: "POST",
          body: z.object({
            token: z.string().min(10),
            name: z.string().trim().min(1).max(80),
            email: z.string().trim().email().optional(),
          }),
        },
        async (ctx) => {
          const inv = await db.query.invite.findFirst({
            where: and(eq(invite.tokenHash, hashToken(ctx.body.token)), isNull(invite.usedAt)),
          });
          if (!inv || inv.expiresAt < new Date()) {
            throw new APIError("BAD_REQUEST", { message: "This invite link is invalid or has expired." });
          }
          const created = await ctx.context.internalAdapter.createUser({
            name: ctx.body.name,
            email: ctx.body.email ?? placeholderEmail(ctx.body.name),
            emailVerified: false,
            role: inv.role,
            createdAt: new Date(),
            updatedAt: new Date(),
          }, { method: "tower" });
          await db.transaction(async (tx) => {
            await tx.update(invite).set({ usedAt: new Date(), usedBy: created.id }).where(eq(invite.id, inv.id));
            if (inv.workspaceIds.length) {
              await tx
                .insert(workspaceMember)
                .values(inv.workspaceIds.map((workspaceId) => ({ workspaceId, userId: created.id })))
                .onConflictDoNothing();
            }
          });
          const session = await ctx.context.internalAdapter.createSession(created.id);
          await setSessionCookie(ctx, { session, user: created });
          await audit({ actorId: created.id, action: "invite.redeemed", entityType: "invite", entityId: inv.id });
          return ctx.json({ userId: created.id });
        },
      ),

      towerRecover: createAuthEndpoint(
        "/tower/recover",
        { method: "POST", body: z.object({ token: z.string().min(10) }) },
        async (ctx) => {
          const link = await db.query.recoveryLink.findFirst({
            where: and(eq(recoveryLink.tokenHash, hashToken(ctx.body.token)), isNull(recoveryLink.usedAt)),
          });
          if (!link || link.expiresAt < new Date()) {
            throw new APIError("BAD_REQUEST", { message: "This recovery link is invalid or has expired." });
          }
          const u = await db.query.user.findFirst({ where: eq(user.id, link.userId) });
          if (!u) throw new APIError("BAD_REQUEST", { message: "User no longer exists." });
          await db.update(recoveryLink).set({ usedAt: new Date() }).where(eq(recoveryLink.id, link.id));
          const session = await ctx.context.internalAdapter.createSession(u.id);
          await setSessionCookie(ctx, { session, user: u });
          await audit({ actorId: u.id, action: "recovery.redeemed", entityType: "user", entityId: u.id });
          return ctx.json({ userId: u.id });
        },
      ),

      devLogin: createAuthEndpoint(
        "/dev/login",
        { method: "POST", body: z.object({ userId: z.string().min(1) }) },
        async (ctx) => {
          if (!devLoginEnabled()) throw new APIError("NOT_FOUND", { message: "Not found." });
          const u = await db.query.user.findFirst({ where: eq(user.id, ctx.body.userId) });
          if (!u) throw new APIError("NOT_FOUND", { message: "Unknown user." });
          const session = await ctx.context.internalAdapter.createSession(u.id);
          await setSessionCookie(ctx, { session, user: u });
          return ctx.json({ userId: u.id, role: u.role });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

function placeholderEmail(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
  return `${slug}-${randomUUID().slice(0, 8)}@users.tower.invalid`;
}
