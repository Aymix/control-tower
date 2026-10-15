import { describe, expect, it } from "vitest";
import { checkBash, checkFileWrite, checkPlanningCommand, splitCommands, type BashGuardContext } from "@/lib/guards/bash";

const impl: BashGuardContext = { kind: "implementation", worktree: "/home/me/.tower-runner/worktrees/s1", defaultBranch: "main", sessionBranch: "t12-fix" };
const plan: BashGuardContext = { ...impl, kind: "planning" };

describe("splitCommands", () => {
  it("splits on && ; || and pipes", () => {
    expect(splitCommands("git add . && git commit -m x; echo ok | cat")).toEqual(["git add .", "git commit -m x", "echo ok", "cat"]);
  });
});

describe("git guards (implementation)", () => {
  it("blocks force pushes and history rewrites", () => {
    expect(checkBash("git push --force origin t12-fix", impl).allow).toBe(false);
    expect(checkBash("git push -f", impl).allow).toBe(false);
    expect(checkBash("git push origin +t12-fix", impl).allow).toBe(false);
    expect(checkBash("git push --force-with-lease", impl).allow).toBe(false);
    expect(checkBash("git reset --hard HEAD~1", impl).allow).toBe(false);
    expect(checkBash("git rebase main", impl).allow).toBe(false);
    expect(checkBash("git commit --amend -m x", impl).allow).toBe(false);
    expect(checkBash("git branch -D old", impl).allow).toBe(false);
    expect(checkBash("git push origin --delete t12-fix", impl).allow).toBe(false);
    expect(checkBash("git push origin :t12-fix", impl).allow).toBe(false);
    expect(checkBash("git filter-branch --all", impl).allow).toBe(false);
    expect(checkBash("git clean -fd", impl).allow).toBe(false);
  });
  it("blocks pushing to or checking out the default branch", () => {
    expect(checkBash("git push origin main", impl).allow).toBe(false);
    expect(checkBash("git push origin HEAD:main", impl).allow).toBe(false);
    expect(checkBash("git checkout main", impl).allow).toBe(false);
    expect(checkBash("git switch main", impl).allow).toBe(false);
    expect(checkBash("git -C /tmp/x push origin main", impl).allow).toBe(false);
  });
  it("allows normal work", () => {
    expect(checkBash("git status", impl).allow).toBe(true);
    expect(checkBash("git add -A && git commit -m 'feat: thing'", impl).allow).toBe(true);
    expect(checkBash("git push -u origin t12-fix", impl).allow).toBe(true);
    expect(checkBash("git checkout -b t12-fix-2", impl).allow).toBe(true);
    expect(checkBash("git reset --soft HEAD~1", impl).allow).toBe(true);
    expect(checkBash("git clean -n", impl).allow).toBe(true);
    expect(checkBash("git merge origin/main", impl).allow).toBe(true);
  });
  it("blocks destructive commands outside the worktree", () => {
    expect(checkBash("rm -rf /", impl).allow).toBe(false);
    expect(checkBash("rm -rf ~/projects", impl).allow).toBe(false);
    expect(checkBash("rm -rf /home/me/other", impl).allow).toBe(false);
    expect(checkBash("rm -rf ../../something", impl).allow).toBe(false);
    expect(checkBash("rm -rf node_modules", impl).allow).toBe(true);
    expect(checkBash("rm -rf /home/me/.tower-runner/worktrees/s1/dist", impl).allow).toBe(true);
    expect(checkBash("dd if=/dev/zero of=/dev/sda", impl).allow).toBe(false);
  });
});

describe("planning guards (read-only)", () => {
  it("denies writes, redirects and git mutations", () => {
    expect(checkPlanningCommand("echo hi > notes.md").allow).toBe(false);
    expect(checkPlanningCommand("cat a | tee b").allow).toBe(false);
    expect(checkPlanningCommand("git commit -m x").allow).toBe(false);
    expect(checkPlanningCommand("git checkout -b x").allow).toBe(false);
    expect(checkPlanningCommand("sed -i 's/a/b/' f").allow).toBe(false);
    expect(checkPlanningCommand("touch x").allow).toBe(false);
    expect(checkPlanningCommand("curl http://x").allow).toBe(false);
    expect(checkPlanningCommand("npm publish").allow).toBe(false);
  });
  it("allows reading, tests, lint and typecheck", () => {
    expect(checkPlanningCommand("rg -n 'TODO' src").allow).toBe(true);
    expect(checkPlanningCommand("cat package.json").allow).toBe(true);
    expect(checkPlanningCommand("pnpm test 2>&1").allow).toBe(true);
    expect(checkPlanningCommand("pnpm exec tsc --noEmit").allow).toBe(true);
    expect(checkPlanningCommand("npm run lint > /dev/null").allow).toBe(true);
    expect(checkPlanningCommand("git log --oneline -20").allow).toBe(true);
    expect(checkPlanningCommand("git diff main...HEAD").allow).toBe(true);
    expect(checkBash("ls -la && git status", plan).allow).toBe(true);
  });
});

describe("file write guard", () => {
  it("denies all writes in planning", () => {
    expect(checkFileWrite("/home/me/.tower-runner/worktrees/s1/a.ts", plan).allow).toBe(false);
  });
  it("keeps implementation writes inside the worktree", () => {
    expect(checkFileWrite("src/a.ts", impl).allow).toBe(true);
    expect(checkFileWrite("/home/me/.tower-runner/worktrees/s1/src/a.ts", impl).allow).toBe(true);
    expect(checkFileWrite("/etc/passwd", impl).allow).toBe(false);
    expect(checkFileWrite("/home/me/.tower-runner/worktrees/s1/.git/config", impl).allow).toBe(false);
    expect(checkFileWrite("/home/me/.tower-runner/worktrees/s10/x", impl).allow).toBe(false);
  });
});
