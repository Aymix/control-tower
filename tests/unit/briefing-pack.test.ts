import { describe, expect, it } from "vitest";
import { buildBriefingPack, type BriefingPackInput } from "@/lib/briefings/pack";

const d = (s: string) => new Date(s);
const base: BriefingPackInput = {
  kind: "status_update",
  owner: { name: "Amine" },
  org: { name: "Amine Co", styleGuide: "Short. Warm. No buzzwords." },
  workspace: { name: "Acme platform", clientName: "Acme Inc.", rules: "" },
  instructions: "Mention the launch date moved to the 20th.",
  tasks: [
    { number: 1, title: "Checkout redesign", status: "in_progress", priority: "high", updatedAt: d("2026-10-10"), assignee: "Sara" },
    { number: 2, title: "Coupon API", status: "blocked", priority: "medium", blockedReason: "need sandbox keys", updatedAt: d("2026-10-11") },
    { number: 3, title: "Flaky test", status: "done", priority: "low", updatedAt: d("2026-10-09") },
  ],
  recentEvents: [{ when: d("2026-10-12"), text: "Sara moved Checkout redesign to In progress" }],
  prs: [{ number: 7, title: "Cart summary", url: "u", state: "merged", mergedAt: d("2026-10-12"), ghUpdatedAt: d("2026-10-12"), taskNumber: 1 }],
  docs: [{ title: "Scope", kind: "scope", content: "Phase 1 scope…" }],
  previous: [{ kind: "status_update", title: "Week 40", finalText: "Last week we shipped the cart.", sentAt: d("2026-10-05") }],
  edits: [{ draft: "We are thrilled to announce…", finalText: "Quick update: the cart shipped.", when: d("2026-10-05") }],
  now: d("2026-10-15T10:00:00Z"),
};

describe("buildBriefingPack", () => {
  it("frames the owner's voice, the kind guide, the style guide and edit examples in the system append", () => {
    const { systemAppend } = buildBriefingPack(base);
    expect(systemAppend).toContain("write in the first person as Amine");
    expect(systemAppend).toContain("Write a client status update");
    expect(systemAppend).toContain("Short. Warm. No buzzwords.");
    expect(systemAppend).toContain("How Amine edits drafts");
    expect(systemAppend).toContain("We are thrilled to announce");
    expect(systemAppend).toContain("Quick update: the cart shipped.");
    expect(systemAppend).toContain("submit_briefing exactly once");
  });
  it("puts instructions, previous briefing, board snapshot, PRs and activity in the first message", () => {
    const { firstMessage } = buildBriefingPack(base);
    expect(firstMessage).toContain("Mention the launch date moved to the 20th.");
    expect(firstMessage).toContain("Previously sent");
    expect(firstMessage).toContain("### Blocked");
    expect(firstMessage).toContain("blocked: need sandbox keys");
    expect(firstMessage).toContain("### Done recently");
    expect(firstMessage).toContain("#7 Cart summary — merged (merged 2026-10-12)");
    expect(firstMessage).toContain("Sara moved Checkout redesign");
    expect(firstMessage.endsWith("call submit_briefing.")).toBe(true);
  });
  it("includes task context for task-bound kinds", () => {
    const { firstMessage, systemAppend } = buildBriefingPack({
      ...base,
      kind: "blocker",
      task: {
        task: base.tasks[1],
        comments: [{ author: "Amine", kind: "user", body: "Asked twice already", when: d("2026-10-11") }],
        subtasks: [],
        prs: [],
      },
    });
    expect(systemAppend).toContain("what is blocked");
    expect(firstMessage).toContain("## The task");
    expect(firstMessage).toContain("Blocked: need sandbox keys");
    expect(firstMessage).toContain("Asked twice already");
  });
  it("falls back to a default style when no style guide exists and caps edit examples", () => {
    const { systemAppend } = buildBriefingPack({ ...base, org: { ...base.org, styleGuide: "" }, edits: Array.from({ length: 6 }, (_, i) => ({ draft: `d${i}`, finalText: `f${i}`, when: d("2026-10-01") })), limits: { edits: 2 } });
    expect(systemAppend).toContain("No style guide is set yet");
    expect(systemAppend).toContain("Example 2");
    expect(systemAppend).not.toContain("Example 3");
  });
});
