import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(entry: {
  actorId?: string | null;
  workspaceId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLog).values({
      id: randomUUID(),
      actorId: entry.actorId ?? null,
      workspaceId: entry.workspaceId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      meta: entry.meta ?? {},
    });
  } catch (err) {
    console.error("audit failed", err);
  }
}
