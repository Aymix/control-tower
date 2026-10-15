import { describe, expect, it } from "vitest";
import { buildContextPack, type ContextPackInput } from "@/lib/sessions/context-pack";

const base: ContextPackInput = {
  kind: "implementation",
  org: { name: "Amine Co", globalRules: "Use TypeScript.", guardrails: "Never touch prod." },
  workspace: { name: "Acme", clientName: "Acme Inc.", rules: "Run pnpm test." },
  repo: { owner: "acme", name: "app", defaultBranch: "main" },
  branch: "t7-add-thing",
  task: { number: 7, title: "Add thing", description: "Do the thing.", status: "in_progress", priority: "high" },
  parent: { number: 1, title: "Epic", description: "Big picture", status: "backlog", priority: "medium" },
  parentPlan: { title: "Plan: T-1", kind: "plan", content: "1. a\n2. b", pinned: false },
  subtasks: [{ number: 8, title: "Other", description: "", status: "backlog", priority: "low" }],
  blockers: [{ number: 5, title: "Creds", description: "", status: "blocked", priority: "urgent", blockedReason: "waiting" }],
  docs: [
    { title: "Notes", kind: "meeting_notes", content: "n", pinned: false },
    { title: "Architecture", kind: "architecture", content: "x".repeat(50), pinned: true },
  ],
  prs: [{ number: 3, title: "WIP", url: "https://github.com/acme/app/pull/3", state: "open", branch: "t7-add-thing", ciStatus: "pending" }],
  comments: Array.from({ length: 20 }, (_, i) => ({ kind: "user", author: "Amine", body: `comment ${i}`, createdAt: new Date(2026, 0, 1, i) })),
  instruction: "Be careful with the API.",
};

describe("buildContextPack", () => {
  it("orders rules → guardrails → workspace rules → KB (pinned first) in the system append", () => {
    const { systemAppend } = buildContextPack(base);
    const idx = (s: string) => systemAppend.indexOf(s);
    expect(idx("## Global rules")).toBeLessThan(idx("## Guardrails"));
    expect(idx("## Guardrails")).toBeLessThan(idx("## Workspace rules"));
    expect(idx("## Workspace rules")).toBeLessThan(idx("## Knowledge base"));
    expect(idx("### Architecture")).toBeLessThan(idx("### Notes"));
    expect(systemAppend).toContain("IMPLEMENTATION session");
    expect(systemAppend).toContain("t7-add-thing");
  });
  it("puts task, parent, plan, siblings, blockers, PRs, recent comments and instruction in the first message", () => {
    const { firstMessage } = buildContextPack(base);
    expect(firstMessage).toContain("# Task T-7: Add thing");
    expect(firstMessage).toContain("## Parent task T-1");
    expect(firstMessage).toContain("## Plan from the parent task");
    expect(firstMessage).toContain("- T-8 Other (backlog)");
    expect(firstMessage).toContain("- T-5 Creds (blocked)");
    expect(firstMessage).toContain("#3 WIP — open");
    expect(firstMessage).toContain("comment 19");
    expect(firstMessage).not.toContain("comment 0\n");
    expect(firstMessage.endsWith("Be careful with the API.")).toBe(true);
  });
  it("planning sessions are flagged read-only and get the default instruction", () => {
    const { systemAppend, firstMessage } = buildContextPack({ ...base, kind: "planning", instruction: "" });
    expect(systemAppend).toContain("PLANNING session: read-only");
    expect(firstMessage).toContain("Study the task and propose a plan.");
  });
  it("truncates long documents", () => {
    const { systemAppend } = buildContextPack({ ...base, limits: { docChars: 10 } });
    expect(systemAppend).toContain("(truncated 40 chars)");
  });
});
