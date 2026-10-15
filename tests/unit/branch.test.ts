import { describe, expect, it } from "vitest";
import { branchNameFor, parsePullRequestUrl, taskNumberFromBranch } from "@/lib/prs/branch";

describe("taskNumberFromBranch", () => {
  it("parses t<number>-slug", () => {
    expect(taskNumberFromBranch("t42-fix-login")).toBe(42);
    expect(taskNumberFromBranch("T7")).toBe(7);
    expect(taskNumberFromBranch("t12-feature/nested-path")).toBe(12);
  });
  it("rejects other branches", () => {
    expect(taskNumberFromBranch("main")).toBeNull();
    expect(taskNumberFromBranch("feature/t42-x")).toBeNull();
    expect(taskNumberFromBranch("t0-zero")).toBeNull();
    expect(taskNumberFromBranch("task-42")).toBeNull();
  });
});

describe("branchNameFor", () => {
  it("builds a slug", () => {
    expect(branchNameFor(3, "Fix the login flow!")).toBe("t3-fix-the-login-flow");
    expect(branchNameFor(9, "Éléphant   rose")).toBe("t9-elephant-rose");
    expect(branchNameFor(4, "###")).toBe("t4");
  });
  it("round-trips through taskNumberFromBranch", () => {
    expect(taskNumberFromBranch(branchNameFor(123, "Something long enough to be truncated by the slug limit"))).toBe(123);
  });
});

describe("parsePullRequestUrl", () => {
  it("parses GitHub PR URLs", () => {
    expect(parsePullRequestUrl("https://github.com/acme/app/pull/17")).toEqual({ owner: "acme", repo: "app", number: 17 });
    expect(parsePullRequestUrl("https://github.com/acme/app/pull/17/files?x=1")).toEqual({ owner: "acme", repo: "app", number: 17 });
  });
  it("rejects non-PR URLs", () => {
    expect(parsePullRequestUrl("https://github.com/acme/app/issues/17")).toBeNull();
    expect(parsePullRequestUrl("https://gitlab.com/acme/app/-/merge_requests/1")).toBeNull();
    expect(parsePullRequestUrl("not a url")).toBeNull();
  });
});
