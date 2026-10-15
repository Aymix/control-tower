import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { towerPlugin } from "./tower-plugin";

const appUrl = new URL(env().APP_URL);

export const auth = betterAuth({
  appName: "Control Tower",
  baseURL: env().APP_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: false },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "dev", input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/passkey/delete-passkey") {
        const session = ctx.context.session ?? (await getSessionFromCtx(ctx));
        if (!session) return;
        const mine = await db.query.passkey.findMany({ where: eq(schema.passkey.userId, session.user.id) });
        if (mine.length <= 1) {
          throw new APIError("BAD_REQUEST", { message: "You cannot remove your last passkey. Add another one first." });
        }
      }
    }),
  },
  plugins: [
    passkey({
      rpID: appUrl.hostname,
      rpName: "Control Tower",
      origin: env().APP_URL,
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    }),
    towerPlugin(),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
