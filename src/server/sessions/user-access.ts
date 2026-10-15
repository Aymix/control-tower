import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSession } from "@/db/schema";
import { canAccessWorkspace, getCurrentUser } from "@/server/auth";

export async function loadSessionForUser(id: string) {
  const me = await getCurrentUser();
  if (!me) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const s = await db.query.agentSession.findFirst({ where: eq(agentSession.id, id) });
  if (!s || !(await canAccessWorkspace(me, s.workspaceId))) return { error: Response.json({ error: "not found" }, { status: 404 }) } as const;
  return { me, session: s } as const;
}
