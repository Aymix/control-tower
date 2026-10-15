import { buildBundle } from "@/server/sessions/service";
import { jsonError } from "@/server/runner-auth";
import { withRunner } from "../../../_lib";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRunner(req, async (runner) => {
    const bundle = await buildBundle(id, runner);
    if (!bundle) return jsonError("Session not held by this runner.", 404);
    return Response.json({ ok: true, ...bundle });
  });
}
