import { z } from "zod";
import { SESSION_STATUSES } from "@/db/schema";
import { updateSessionStatus } from "@/server/sessions/service";
import { readJson, withRunner } from "../../../_lib";

const schema = z.object({
  status: z.enum(SESSION_STATUSES).optional(),
  sdkSessionId: z.string().nullable().optional(),
  apiKeySource: z.string().nullable().optional(),
  claudeVersion: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  worktreePath: z.string().nullable().optional(),
  hasUnpushedCommits: z.boolean().optional(),
  attached: z.boolean().optional(),
  error: z.string().max(4000).nullable().optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      cacheReadTokens: z.number().int().nonnegative(),
      cacheWriteTokens: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
      numTurns: z.number().int().nonnegative(),
    })
    .optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRunner(req, async (runner) => {
    const body = schema.parse(await readJson(req));
    await updateSessionStatus(id, runner, body);
    return Response.json({ ok: true });
  });
}
