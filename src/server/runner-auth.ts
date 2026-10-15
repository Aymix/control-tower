import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runnerToken, type RunnerToken } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";

export class RunnerAuthError extends Error {
  constructor(message: string, public status = 401, public revoked = false) {
    super(message);
  }
}

/** Resolves the Bearer token of a runner request. Throws RunnerAuthError (401) when invalid or revoked. */
export async function authenticateRunner(req: Request): Promise<RunnerToken> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) throw new RunnerAuthError("Missing runner token.");
  const row = await db.query.runnerToken.findFirst({ where: eq(runnerToken.tokenHash, hashToken(m[1])) });
  if (!row) throw new RunnerAuthError("Unknown runner token.");
  if (row.revokedAt) throw new RunnerAuthError("This runner token was revoked.", 401, true);
  return row;
}

export function runnerIsOnline(r: Pick<RunnerToken, "lastSeenAt" | "revokedAt">, now = new Date()): boolean {
  if (r.revokedAt || !r.lastSeenAt) return false;
  return now.getTime() - r.lastSeenAt.getTime() < env().RUNNER_OFFLINE_SECONDS * 1000;
}

export function runnerAuthLabel(r: Pick<RunnerToken, "apiKeySource" | "hasApiKeyEnv">): "Claude plan" | "API key" | "Unknown" {
  if (r.apiKeySource === "none" || r.apiKeySource === "oauth") return "Claude plan";
  if (r.apiKeySource || r.hasApiKeyEnv) return "API key";
  return "Unknown";
}

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}
