"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { proposal, proposalBatch, task, taskBlocker, type Proposal } from "@/db/schema";
import { audit } from "@/server/audit";
import { requireOwner, requireUser, requireWorkspaceById, type CurrentUser } from "@/server/auth";
import { addSystemComment, createTaskRecord } from "@/server/tasks";
import { fail, ok, run, type ActionResult } from "./result";
import { createProposalBatch } from "@/server/proposals";

/** Manual breakdown form: one line per proposal, "Title :: what to do :: acceptance". */
export async function createManualBatch(workspaceId: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireUser();
    const ws = await requireWorkspaceById(me, workspaceId);
    const title = String(formData.get("title") ?? "").trim();
    const sourceTaskId = String(formData.get("sourceTaskId") ?? "") || null;
    const raw = String(formData.get("items") ?? "");
    const items = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line, i) => {
        const [t, body = "", ac = ""] = line.split("::").map((s) => s.trim());
        return { key: `p${i + 1}`, title: t.replace(/^[-*]\s*/, ""), body, acceptanceCriteria: ac, dependsOn: [] as string[] };
      });
    if (!items.length) return fail("Add at least one proposal line.");
    const batchId = await createProposalBatch(ws.id, me.id, { title: title || "Manual breakdown", items, source: sourceTaskId ? "breakdown" : "manual", sourceTaskId });
    await audit({ actorId: me.id, workspaceId: ws.id, action: "proposals.batch_created", entityType: "proposal_batch", entityId: batchId });
    revalidatePath(`/w/${ws.slug}/proposals`);
    return ok();
  });
}

async function loadProposal(me: CurrentUser, id: string) {
  const p = await db.query.proposal.findFirst({ where: eq(proposal.id, id), with: { batch: true } });
  if (!p) throw new Error("Proposal not found.");
  const ws = await requireWorkspaceById(me, p.workspaceId);
  return { p, ws };
}

const editSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000),
  acceptanceCriteria: z.string().max(20_000),
});

export async function editProposal(id: string, formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const { p, ws } = await loadProposal(me, id);
    if (p.status !== "pending") return fail("Only pending proposals can be edited.");
    const input = editSchema.parse({
      title: formData.get("title"),
      body: formData.get("body") ?? "",
      acceptanceCriteria: formData.get("acceptanceCriteria") ?? "",
    });
    await db.update(proposal).set(input).where(eq(proposal.id, p.id));
    revalidatePath(`/w/${ws.slug}/proposals`);
    return ok();
  });
}

function taskDescriptionFor(p: Proposal) {
  const parts = [p.body.trim()];
  if (p.acceptanceCriteria.trim()) parts.push(`## Acceptance criteria\n\n${p.acceptanceCriteria.trim()}`);
  return parts.filter(Boolean).join("\n\n");
}

export async function acceptProposal(id: string, opts: { asSubtask?: boolean } = {}): Promise<ActionResult<{ taskNumber: number }>> {
  return run(async () => {
    const me = await requireOwner();
    const { p, ws } = await loadProposal(me, id);
    if (p.status !== "pending") return fail("This proposal was already decided.");
    const parentId = opts.asSubtask && p.batch.sourceTaskId ? p.batch.sourceTaskId : null;
    if (parentId) {
      const parent = await db.query.task.findFirst({ where: eq(task.id, parentId) });
      if (parent?.parentId) return fail("The source task is itself a subtask; accept as a top-level task instead.");
    }
    const t = await createTaskRecord({ workspaceId: ws.id, title: p.title, description: taskDescriptionFor(p), parentId, createdBy: me.id });
    await db.update(proposal).set({ status: "accepted", resultingTaskId: t.id, decidedAt: new Date(), decidedBy: me.id }).where(eq(proposal.id, p.id));
    await addSystemComment(t.id, `Created from proposal **${p.title}** in batch “${p.batch.title}”.`);
    // Wire dependencies that were already accepted.
    if (p.dependsOn.length) {
      const deps = await db.query.proposal.findMany({ where: and(eq(proposal.batchId, p.batchId), eq(proposal.status, "accepted")) });
      for (const d of deps) {
        if (p.dependsOn.includes(d.key) && d.resultingTaskId) {
          await db.insert(taskBlocker).values({ taskId: t.id, blockedById: d.resultingTaskId }).onConflictDoNothing();
        }
      }
    }
    await audit({ actorId: me.id, workspaceId: ws.id, action: "proposal.accepted", entityType: "proposal", entityId: p.id, meta: { taskNumber: t.number } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok({ taskNumber: t.number });
  });
}

export async function acceptAllPending(batchId: string, opts: { asSubtasks?: boolean } = {}): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const b = await db.query.proposalBatch.findFirst({ where: eq(proposalBatch.id, batchId), with: { proposals: true } });
    if (!b) return fail("Batch not found.");
    await requireWorkspaceById(me, b.workspaceId);
    const pending = b.proposals.filter((p) => p.status === "pending").sort((a, z) => a.position - z.position);
    for (const p of pending) {
      const r = await acceptProposal(p.id, { asSubtask: opts.asSubtasks });
      if (!r.ok) return r;
    }
    return ok();
  });
}

export async function mergeProposalIntoTask(id: string, taskNumber: number): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const { p, ws } = await loadProposal(me, id);
    if (p.status !== "pending") return fail("This proposal was already decided.");
    const t = await db.query.task.findFirst({ where: and(eq(task.workspaceId, ws.id), eq(task.number, taskNumber)) });
    if (!t) return fail(`T-${taskNumber} not found.`);
    const addition = `\n\n---\n\n## Merged proposal: ${p.title}\n\n${taskDescriptionFor(p)}`;
    await db.update(task).set({ description: t.description + addition, updatedAt: new Date() }).where(eq(task.id, t.id));
    await db.update(proposal).set({ status: "merged", resultingTaskId: t.id, decidedAt: new Date(), decidedBy: me.id }).where(eq(proposal.id, p.id));
    await addSystemComment(t.id, `**${me.name}** merged proposal **${p.title}** into this task.`);
    await audit({ actorId: me.id, workspaceId: ws.id, action: "proposal.merged", entityType: "proposal", entityId: p.id, meta: { taskNumber } });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return ok();
  });
}

export async function discardProposal(id: string): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const { p, ws } = await loadProposal(me, id);
    if (p.status !== "pending") return fail("This proposal was already decided.");
    await db.update(proposal).set({ status: "discarded", decidedAt: new Date(), decidedBy: me.id }).where(eq(proposal.id, p.id));
    await audit({ actorId: me.id, workspaceId: ws.id, action: "proposal.discarded", entityType: "proposal", entityId: p.id });
    revalidatePath(`/w/${ws.slug}/proposals`);
    return ok();
  });
}
