import { listSessionEvents } from "@/server/sessions/service";
import { loadSessionForUser } from "@/server/sessions/user-access";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadSessionForUser(id);
  if ("error" in r) return r.error;
  const after = Number(new URL(req.url).searchParams.get("after") ?? "0") || 0;
  const events = await listSessionEvents(id, after, 2000);
  return Response.json({ events: events.map((e) => ({ seq: e.seq, type: e.type, payload: e.payload, createdAt: e.createdAt })), status: r.session.status, lastSeq: r.session.lastSeq });
}
