/**
 * Builds the context pack handed to a Claude session:
 * rules → guardrails → workspace rules → pinned/relevant KB → task → parent plan →
 * siblings & blockers → PRs → recent comments. Pure function; unit-tested.
 */

export type PackTask = { number: number; title: string; description: string; status: string; priority: string; blockedReason?: string | null };
export type PackDoc = { title: string; kind: string; content: string; pinned: boolean };
export type PackPr = { number: number; title: string; url: string; state: string; branch: string; ciStatus: string };
export type PackComment = { kind: string; author: string | null; body: string; createdAt: Date };

export type ContextPackInput = {
  kind: "planning" | "implementation";
  org: { name: string; globalRules: string; guardrails: string };
  workspace: { name: string; clientName: string; rules: string };
  repo: { owner: string; name: string; defaultBranch: string } | null;
  branch: string | null;
  task: PackTask;
  parent: PackTask | null;
  parentPlan: PackDoc | null;
  subtasks: PackTask[];
  blockers: PackTask[];
  docs: PackDoc[];
  prs: PackPr[];
  comments: PackComment[];
  instruction: string;
  limits?: { docChars?: number; commentChars?: number; comments?: number };
};

const DEFAULT_LIMITS = { docChars: 20_000, commentChars: 1_500, comments: 15 };

export function buildContextPack(input: ContextPackInput): { systemAppend: string; firstMessage: string } {
  const L = { ...DEFAULT_LIMITS, ...(input.limits ?? {}) };
  const sections: string[] = [];

  sections.push(
    `# Control Tower session\n\nYou are working for ${input.org.name} on the client workspace "${input.workspace.name}" (${input.workspace.clientName}).` +
      ` This is ${input.kind === "planning" ? "a PLANNING session: read-only. Investigate, then call submit_plan with proposals. Do not edit files." : "an IMPLEMENTATION session: make the change on the session branch, commit with clear messages, push, then call open_pull_request."}` +
      ` If you cannot proceed, call report_blocker with a precise reason instead of guessing.`,
  );
  if (input.org.globalRules.trim()) sections.push(`## Global rules\n\n${input.org.globalRules.trim()}`);
  if (input.org.guardrails.trim()) sections.push(`## Guardrails (hard limits)\n\n${input.org.guardrails.trim()}`);
  if (input.workspace.rules.trim()) sections.push(`## Workspace rules\n\n${input.workspace.rules.trim()}`);
  if (input.repo) {
    sections.push(
      `## Repository\n\n${input.repo.owner}/${input.repo.name}, default branch \`${input.repo.defaultBranch}\`.` +
        (input.branch ? ` Your session branch is \`${input.branch}\`. Never push to or check out \`${input.repo.defaultBranch}\`; never force-push or rewrite history.` : ""),
    );
  }
  const docs = [...input.docs].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  if (docs.length) {
    sections.push(
      `## Knowledge base\n\n` +
        docs.map((d) => `### ${d.title} (${d.kind}${d.pinned ? ", pinned" : ""})\n\n${clip(d.content, L.docChars)}`).join("\n\n"),
    );
  }

  const first: string[] = [];
  first.push(`# Task T-${input.task.number}: ${input.task.title}\n\nStatus: ${input.task.status} · Priority: ${input.task.priority}${input.task.blockedReason ? ` · Blocked: ${input.task.blockedReason}` : ""}`);
  if (input.task.description.trim()) first.push(input.task.description.trim());
  if (input.parent) {
    first.push(`## Parent task T-${input.parent.number}: ${input.parent.title}\n\n${input.parent.description.trim() || "(no description)"}`);
  }
  if (input.parentPlan) first.push(`## Plan from the parent task\n\n${clip(input.parentPlan.content, L.docChars)}`);
  if (input.subtasks.length) {
    first.push(`## Sibling subtasks\n\n${input.subtasks.map((s) => `- T-${s.number} ${s.title} (${s.status})`).join("\n")}`);
  }
  if (input.blockers.length) {
    first.push(`## Blocked by\n\n${input.blockers.map((b) => `- T-${b.number} ${b.title} (${b.status})`).join("\n")}`);
  }
  if (input.prs.length) {
    first.push(`## Pull requests on this task\n\n${input.prs.map((p) => `- #${p.number} ${p.title} — ${p.state}, branch \`${p.branch}\`, CI ${p.ciStatus} — ${p.url}`).join("\n")}`);
  }
  const comments = input.comments.slice(-L.comments);
  if (comments.length) {
    first.push(
      `## Recent discussion\n\n` +
        comments
          .map((c) => `**${c.kind === "user" ? c.author ?? "User" : c.kind === "agent" ? "Claude" : "System"}** (${c.createdAt.toISOString().slice(0, 16).replace("T", " ")}): ${clip(c.body, L.commentChars)}`)
          .join("\n\n"),
    );
  }
  first.push(`## Instruction\n\n${input.instruction.trim() || (input.kind === "planning" ? "Study the task and propose a plan." : "Implement the task.")}`);

  return { systemAppend: sections.join("\n\n"), firstMessage: first.join("\n\n") };
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max) + `\n\n…(truncated ${t.length - max} chars)`;
}
