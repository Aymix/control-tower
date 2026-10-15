import { authenticateRunner, jsonError, RunnerAuthError } from "@/server/runner-auth";
import type { RunnerToken } from "@/db/schema";

export async function withRunner(req: Request, fn: (runner: RunnerToken) => Promise<Response>): Promise<Response> {
  try {
    const runner = await authenticateRunner(req);
    return await fn(runner);
  } catch (err) {
    if (err instanceof RunnerAuthError) return jsonError(err.message, err.status, { revoked: err.revoked });
    console.error("[runner api]", err);
    return jsonError((err as Error).message ?? "Internal error", 500);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
