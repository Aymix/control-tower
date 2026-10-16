/**
 * CLAUDE.md sync: renders the managed section from org + workspace rules and
 * pinned knowledge, and merges it into an existing file between markers so the
 * repo's own content outside the markers is preserved.
 */

export const START = "<!-- control-tower:start -->";
export const END = "<!-- control-tower:end -->";

export type ClaudeMdInput = {
  orgName: string;
  workspaceName: string;
  clientName: string;
  globalRules: string;
  guardrails: string;
  workspaceRules: string;
  docs: { title: string; kind: string; content: string }[];
  towerUrl?: string | null;
  limits?: { docChars?: number; totalChars?: number };
};

export function renderManagedSection(input: ClaudeMdInput): string {
  const L = { docChars: 6000, totalChars: 40_000, ...(input.limits ?? {}) };
  const parts: string[] = [];
  parts.push(`# ${input.workspaceName} — working rules`);
  parts.push(`_Managed by Control Tower (${input.orgName}) for ${input.clientName}. Edit the rules in Control Tower, not here; this section is overwritten on sync. Content outside the markers is yours._`);
  if (input.globalRules.trim()) parts.push(`## Global rules\n\n${input.globalRules.trim()}`);
  if (input.guardrails.trim()) parts.push(`## Guardrails\n\n${input.guardrails.trim()}`);
  if (input.workspaceRules.trim()) parts.push(`## Workspace rules\n\n${input.workspaceRules.trim()}`);
  for (const d of input.docs) parts.push(`## ${d.title} (${d.kind.replace(/_/g, " ")})\n\n${clip(d.content, L.docChars)}`);
  if (input.towerUrl) parts.push(`Tasks, PRs and sessions: ${input.towerUrl}`);
  let body = parts.join("\n\n");
  if (body.length > L.totalChars) body = body.slice(0, L.totalChars) + "\n\n…(truncated by Control Tower; pin fewer or shorter documents)";
  return `${START}\n${body}\n${END}`;
}

/** Replaces the managed block in `existing`, or appends it when absent. */
export function mergeManagedSection(existing: string | null, managed: string): { content: string; changed: boolean } {
  if (existing == null || existing.trim() === "") return { content: managed + "\n", changed: true };
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  const content = s >= 0 && e > s ? existing.slice(0, s) + managed + existing.slice(e + END.length) : existing.replace(/\s*$/, "") + "\n\n" + managed + "\n";
  return { content, changed: normalize(content) !== normalize(existing) };
}

function normalize(s: string) {
  return s.replace(/\r\n/g, "\n").replace(/\s+$/g, "");
}
function clip(s: string, max: number) {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max) + "\n\n…(truncated)";
}
