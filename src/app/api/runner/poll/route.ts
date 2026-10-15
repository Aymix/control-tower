import { z } from "zod";
import { pollForRunner } from "@/server/sessions/service";
import { readJson, withRunner } from "../_lib";

const schema = z.object({ active: z.array(z.string()).default([]) });

export async function POST(req: Request) {
  return withRunner(req, async (runner) => {
    const body = schema.parse(await readJson(req));
    const res = await pollForRunner(runner, body.active);
    return Response.json({ ok: true, ...res });
  });
}
