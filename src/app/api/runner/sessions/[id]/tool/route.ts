import { z } from "zod";
import { runSessionTool } from "@/server/sessions/tools";
import { readJson, withRunner } from "../../../_lib";

const schema = z.object({ name: z.string().max(60), args: z.unknown() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRunner(req, async (runner) => {
    const body = schema.parse(await readJson(req));
    const res = await runSessionTool(id, runner, body.name, body.args ?? {});
    return Response.json(res, { status: res.ok ? 200 : 400 });
  });
}
