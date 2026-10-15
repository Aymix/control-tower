import { describe, expect, it } from "vitest";
import { checkTransition, subtaskProgress, systemCommentForTransition } from "@/lib/tasks/transitions";

describe("checkTransition", () => {
  it("lets any role move between the open columns", () => {
    expect(checkTransition({ from: "backlog", to: "in_progress", role: "dev" }).ok).toBe(true);
    expect(checkTransition({ from: "in_progress", to: "in_review", role: "dev" }).ok).toBe(true);
    expect(checkTransition({ from: "in_review", to: "in_progress", role: "dev" }).ok).toBe(true);
  });
  it("requires a reason to block", () => {
    expect(checkTransition({ from: "in_progress", to: "blocked", role: "dev" })).toEqual({
      ok: false,
      reason: "Blocking a task requires a reason.",
    });
    expect(checkTransition({ from: "in_progress", to: "blocked", role: "dev", blockedReason: "   " }).ok).toBe(false);
    expect(checkTransition({ from: "in_progress", to: "blocked", role: "dev", blockedReason: "waiting on API key" }).ok).toBe(true);
  });
  it("only the owner can approve Done, and only from In review", () => {
    expect(checkTransition({ from: "in_review", to: "done", role: "dev" }).ok).toBe(false);
    expect(checkTransition({ from: "in_progress", to: "done", role: "owner" }).ok).toBe(false);
    expect(checkTransition({ from: "in_review", to: "done", role: "owner" }).ok).toBe(true);
  });
  it("only the owner can reopen Done", () => {
    expect(checkTransition({ from: "done", to: "in_progress", role: "dev" }).ok).toBe(false);
    expect(checkTransition({ from: "done", to: "backlog", role: "owner" }).ok).toBe(true);
  });
  it("no-op transitions are allowed", () => {
    expect(checkTransition({ from: "done", to: "done", role: "dev" }).ok).toBe(true);
  });
});

describe("systemCommentForTransition", () => {
  it("includes the blocked reason", () => {
    const c = systemCommentForTransition("in_progress", "blocked", "Amine", "need creds");
    expect(c).toContain("In progress");
    expect(c).toContain("Blocked: need creds");
  });
});

describe("subtaskProgress", () => {
  it("counts done subtasks", () => {
    expect(subtaskProgress([{ status: "done" }, { status: "backlog" }])).toEqual({ total: 2, done: 1, label: "1/2" });
    expect(subtaskProgress([]).label).toBeNull();
  });
});
