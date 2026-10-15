import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { proposal, proposalBatch } from "@/db/schema";

export const proposalItemSchema = z.object({
  key: z.string().trim().min(1).max(20),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).default(""),
  acceptanceCriteria: z.string().max(20_000).default(""),
  dependsOn: z.array(z.string()).default([]),
});

export const batchSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(20_000).default(""),
  source: z.enum(["planning", "breakdown", "manual"]).default("manual"),
  sourceTaskId: z.string().nullable().optional(),
  sourceSessionId: z.string().nullable().optional(),
  items: z.array(proposalItemSchema).min(1).max(100),
});

/** Shared with the Claude runner tools in phase 2. */
export async function createProposalBatch(workspaceId: string, createdBy: string | null, input: z.input<typeof batchSchema>) {
  const parsed = batchSchema.parse(input);
  const batchId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(proposalBatch).values({
      id: batchId,
      workspaceId,
      source: parsed.source,
      sourceTaskId: parsed.sourceTaskId ?? null,
      sourceSessionId: parsed.sourceSessionId ?? null,
      title: parsed.title,
      summary: parsed.summary,
      createdBy,
    });
    await tx.insert(proposal).values(
      parsed.items.map((it, i) => ({
        id: randomUUID(),
        batchId,
        workspaceId,
        key: it.key,
        title: it.title,
        body: it.body,
        acceptanceCriteria: it.acceptanceCriteria,
        dependsOn: it.dependsOn,
        position: i,
      })),
    );
  });
  return batchId;
}

