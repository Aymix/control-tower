import { z } from "zod";
import { appendEvents } from "@/server/sessions/service";
import { readJson, withRunner } from "../../../_lib";

const schema = z.object({
  events: z.array(z.object({ seq: z.number().int().positive(), type: z.string().max(40), payload: z.record(z.string(), z.unknown()).default({}) })).max(500),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRunner(req, async (runner) => {
    const body = schema.parse(await readJson(req));
    const lastSeq = await appendEvents(id, runner, body.events);
    return Response.json({ ok: true, lastSeq });
  });
}
