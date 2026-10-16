/**
 * Prompt composition for briefings: client-facing text drafted in the owner's
 * voice. Pure function, unit-tested. The runner feeds `systemAppend` as the
 * system prompt suffix and `firstMessage` as the first user turn; the model
 * must answer by calling submit_briefing.
 */

export type BriefingKind = "status_update" | "pre_task_questions" | "blocker" | "release_notes";

export type BriefingTask = { number: number; title: string; status: string; priority: string; description?: string; blockedReason?: string | null; updatedAt: Date; assignee?: string | null };
export type BriefingPr = { number: number; title: string; url: string; state: string; mergedAt: Date | null; ghUpdatedAt: Date | null; taskNumber: number | null };
export type BriefingEvent = { when: Date; text: string };
export type EditExample = { draft: string; finalText: string; when: Date };
export type PreviousBriefing = { kind: BriefingKind; title: string; finalText: string; sentAt: Date };

export type BriefingPackInput = {
  kind: BriefingKind;
  owner: { name: string };
  org: { name: string; styleGuide: string };
  workspace: { name: string; clientName: string; rules: string };
  instructions: string;
  tasks: BriefingTask[];
  recentEvents: BriefingEvent[];
  prs: BriefingPr[];
  docs: { title: string; kind: string; content: string }[];
  task?: { task: BriefingTask; comments: { author: string | null; kind: string; body: string; when: Date }[]; subtasks: BriefingTask[]; prs: BriefingPr[] } | null;
  previous: PreviousBriefing[];
  edits: EditExample[];
  now?: Date;
  limits?: { docChars?: number; events?: number; edits?: number; editChars?: number };
};

export const KIND_LABEL: Record<BriefingKind, string> = {
  status_update: "Status update",
  pre_task_questions: "Pre-task questions",
  blocker: "Blocker",
  release_notes: "Release notes",
};

const KIND_GUIDE: Record<BriefingKind, string> = {
  status_update:
    "Write a client status update: what was delivered since the last update, what is in progress, what is waiting on the client (with precise asks), and what comes next. Lead with outcomes, not activity. Group by theme, not by task number. Keep task numbers out unless the client uses them.",
  pre_task_questions:
    "Before starting the task, write the questions the client must answer so the work can be scoped and accepted without surprises. Ask only what cannot be decided on our side; propose a default answer for each question so the client can simply confirm. Number the questions.",
  blocker:
    "Tell the client, plainly and without blame, what is blocked, why it matters for the timeline, and exactly what we need from them (who, what, by when). Offer the fastest path to unblock. One short message.",
  release_notes:
    "Write client-facing release notes for what was merged: user-visible changes first, then fixes, then internal/maintenance in one line. No commit hashes, no file names, no PR numbers unless the client tracks them. Mention anything the client must do (migrations, config, re-login).",
};

const DEFAULT_LIMITS = { docChars: 3000, events: 40, edits: 3, editChars: 2500 };

export function buildBriefingPack(input: BriefingPackInput): { systemAppend: string; firstMessage: string } {
  const L = { ...DEFAULT_LIMITS, ...(input.limits ?? {}) };
  const now = input.now ?? new Date();
  const sys: string[] = [];
  sys.push(
    `# Briefing drafting session\n\nYou are drafting a ${KIND_LABEL[input.kind].toLowerCase()} that ${input.owner.name} (${input.org.name}) will send to the client ${input.workspace.clientName} about the "${input.workspace.name}" engagement.` +
      ` ${input.owner.name} is the only person who talks to the client: write in the first person as ${input.owner.name}, in their voice, ready to send after a light edit.` +
      ` You have no repository access and no tools except submit_briefing. Do not ask questions back; make reasonable assumptions and flag them in a short "Notes for ${input.owner.name}" section inside the notes argument, never in the client text.` +
      ` When the draft is ready, call submit_briefing exactly once with the title and the body in markdown.`,
  );
  sys.push(`## What this briefing is\n\n${KIND_GUIDE[input.kind]}`);
  if (input.org.styleGuide.trim()) sys.push(`## ${input.owner.name}'s style guide (follow it closely)\n\n${input.org.styleGuide.trim()}`);
  else sys.push(`## Style\n\nNo style guide is set yet. Default to: short paragraphs, plain words, no hype, specific dates and asks, warm but businesslike, sign off with ${input.owner.name}.`);
  const edits = input.edits.slice(0, L.edits);
  if (edits.length) {
    sys.push(
      `## How ${input.owner.name} edits drafts (learn from these)\n\nBelow are earlier drafts and the versions actually sent. Apply the same kinds of changes before submitting: tone, length, structure, words to avoid.\n\n` +
        edits
          .map((e, i) => `### Example ${i + 1} (${e.when.toISOString().slice(0, 10)})\n\n**Draft**\n\n${clip(e.draft, L.editChars)}\n\n**Sent version**\n\n${clip(e.finalText, L.editChars)}`)
          .join("\n\n"),
    );
  }
  if (input.workspace.rules.trim()) sys.push(`## Workspace notes\n\n${clip(input.workspace.rules, L.docChars)}`);
  if (input.docs.length) sys.push(`## Knowledge base (context only)\n\n` + input.docs.map((d) => `### ${d.title} (${d.kind})\n\n${clip(d.content, L.docChars)}`).join("\n\n"));

  const first: string[] = [];
  first.push(`# Draft a ${KIND_LABEL[input.kind].toLowerCase()} — ${now.toISOString().slice(0, 10)}`);
  if (input.instructions.trim()) first.push(`## Instructions from ${input.owner.name}\n\n${input.instructions.trim()}`);
  if (input.previous.length) {
    first.push(`## Previously sent (do not repeat what the client already knows)\n\n` + input.previous.map((p) => `### ${p.title} — sent ${p.sentAt.toISOString().slice(0, 10)}\n\n${clip(p.finalText, L.docChars)}`).join("\n\n"));
  }
  if (input.task) {
    const t = input.task.task;
    first.push(
      `## The task\n\nT-${t.number} ${t.title} — ${t.status}, priority ${t.priority}${t.blockedReason ? `\n\nBlocked: ${t.blockedReason}` : ""}${t.description?.trim() ? `\n\n${t.description.trim()}` : ""}`,
    );
    if (input.task.subtasks.length) first.push(`### Subtasks\n\n${input.task.subtasks.map((s) => `- ${s.title} (${s.status})`).join("\n")}`);
    if (input.task.prs.length) first.push(`### Pull requests\n\n${input.task.prs.map((p) => `- #${p.number} ${p.title} (${p.state})`).join("\n")}`);
    if (input.task.comments.length) first.push(`### Discussion\n\n${input.task.comments.slice(-12).map((c) => `- ${c.kind === "user" ? c.author ?? "User" : c.kind === "agent" ? "Claude" : "System"} (${c.when.toISOString().slice(0, 10)}): ${clip(c.body, 600)}`).join("\n")}`);
  }
  const byStatus = (s: string) => input.tasks.filter((t) => t.status === s);
  const fmtTask = (t: BriefingTask) => `- ${t.title}${t.assignee ? ` (${t.assignee})` : ""}${t.blockedReason ? ` — blocked: ${t.blockedReason}` : ""}`;
  const board = [
    ["Done recently", byStatus("done")],
    ["In review", byStatus("in_review")],
    ["In progress", byStatus("in_progress")],
    ["Blocked", byStatus("blocked")],
    ["Backlog (next up)", byStatus("backlog").slice(0, 8)],
  ] as const;
  const boardText = board.filter(([, ts]) => ts.length).map(([label, ts]) => `### ${label}\n\n${ts.map(fmtTask).join("\n")}`).join("\n\n");
  if (boardText) first.push(`## Board snapshot\n\n${boardText}`);
  if (input.prs.length) {
    first.push(`## Pull requests (last two weeks)\n\n${input.prs.map((p) => `- #${p.number} ${p.title} — ${p.state}${p.mergedAt ? ` (merged ${p.mergedAt.toISOString().slice(0, 10)})` : ""}${p.taskNumber ? ` — T-${p.taskNumber}` : ""}`).join("\n")}`);
  }
  const events = input.recentEvents.slice(-L.events);
  if (events.length) first.push(`## Recent activity\n\n${events.map((e) => `- ${e.when.toISOString().slice(0, 10)}: ${clip(e.text, 300)}`).join("\n")}`);
  first.push(`## Now\n\nDraft the ${KIND_LABEL[input.kind].toLowerCase()} and call submit_briefing.`);
  return { systemAppend: sys.join("\n\n"), firstMessage: first.join("\n\n") };
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max) + `\n…(truncated)`;
}
