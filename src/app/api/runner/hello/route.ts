import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { runnerToken, user } from "@/db/schema";
import { readJson, withRunner } from "../_lib";

const schema = z.object({
  hostname: z.string().max(200).optional(),
  platform: z.string().max(100).optional(),
  capacity: z.coerce.number().int().min(1).max(16).default(1),
  runnerVersion: z.string().max(40).optional(),
  claudeVersion: z.string().max(60).optional(),
  hasApiKeyEnv: z.boolean().default(false),
});

export async function POST(req: Request) {
  return withRunner(req, async (runner) => {
    const body = schema.parse(await readJson(req));
    await db
      .update(runnerToken)
      .set({
        hostname: body.hostname ?? runner.hostname,
        platform: body.platform ?? runner.platform,
        capacity: body.capacity,
        runnerVersion: body.runnerVersion ?? runner.runnerVersion,
        claudeVersion: body.claudeVersion ?? runner.claudeVersion,
        hasApiKeyEnv: body.hasApiKeyEnv,
        lastSeenAt: new Date(),
      })
      .where(eq(runnerToken.id, runner.id));
    const owner = await db.query.user.findFirst({ where: eq(user.id, runner.userId), columns: { name: true } });
    return Response.json({ ok: true, runnerId: runner.id, runnerName: runner.name, userName: owner?.name ?? "?", pollIntervalMs: 2000 });
  });
}
