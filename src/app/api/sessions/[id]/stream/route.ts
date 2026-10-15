import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSession } from "@/db/schema";
import { listSessionEvents } from "@/server/sessions/service";
import { loadSessionForUser } from "@/server/sessions/user-access";

export const dynamic = "force-dynamic";

/** SSE: streams new transcript events and status changes; the client reconnects with ?after=<seq>. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadSessionForUser(id);
  if ("error" in r) return r.error;
  let after = Number(new URL(req.url).searchParams.get("after") ?? "0") || 0;
  let lastStatus = "";
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const tick = async () => {
        if (closed) return;
        try {
          const s = await db.query.agentSession.findFirst({ where: eq(agentSession.id, id) });
          if (!s) {
            send("gone", {});
            closed = true;
            controller.close();
            return;
          }
          const events = await listSessionEvents(id, after, 200);
          for (const e of events) {
            send("event", { seq: e.seq, type: e.type, payload: e.payload, createdAt: e.createdAt });
            after = e.seq;
          }
          const statusKey = `${s.status}|${s.costMicros}|${s.error ?? ""}|${s.attached}|${s.pullRequestId ?? ""}|${s.hasUnpushedCommits}`;
          if (statusKey !== lastStatus) {
            lastStatus = statusKey;
            send("status", { status: s.status, costUsd: s.costMicros / 1e6, error: s.error, attached: s.attached, pullRequestId: s.pullRequestId, hasUnpushedCommits: s.hasUnpushedCommits, inputTokens: s.inputTokens, outputTokens: s.outputTokens, numTurns: s.numTurns });
          }
          if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (err) {
          console.error("[sse]", err);
        }
        if (!closed) setTimeout(tick, 1000);
      };
      void tick();
      req.signal.addEventListener("abort", () => {
        closed = true;
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
