import { describe, expect, it } from "vitest";
import { computePriority, intervalFor, isDue } from "@/lib/prs/priority";

const cfg = { hotSeconds: 60, warmSeconds: 300, coldSeconds: 1800 };
const now = new Date("2026-01-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("computePriority", () => {
  it("is hot for recently updated open PRs", () => {
    expect(computePriority({ state: "open", ghUpdatedAt: ago(10 * 60_000), createdAt: ago(86_400_000) }, now)).toBe("hot");
  });
  it("is hot when the linked task is in review regardless of age", () => {
    expect(computePriority({ state: "open", ghUpdatedAt: ago(5 * 86_400_000), createdAt: ago(9 * 86_400_000), taskStatus: "in_review" }, now)).toBe("hot");
  });
  it("is warm for quiet open PRs and cold for stale or closed", () => {
    expect(computePriority({ state: "open", ghUpdatedAt: ago(5 * 86_400_000), createdAt: ago(9 * 86_400_000) }, now)).toBe("warm");
    expect(computePriority({ state: "open", ghUpdatedAt: ago(20 * 86_400_000), createdAt: ago(30 * 86_400_000) }, now)).toBe("cold");
    expect(computePriority({ state: "merged", ghUpdatedAt: ago(1000), createdAt: ago(1000) }, now)).toBe("cold");
  });
});

describe("isDue", () => {
  it("is due when never polled", () => {
    expect(isDue({ pollPriority: "cold", lastPolledAt: null }, cfg, now)).toBe(true);
  });
  it("respects the interval per priority", () => {
    expect(isDue({ pollPriority: "hot", lastPolledAt: ago(30_000) }, cfg, now)).toBe(false);
    expect(isDue({ pollPriority: "hot", lastPolledAt: ago(61_000) }, cfg, now)).toBe(true);
    expect(isDue({ pollPriority: "warm", lastPolledAt: ago(61_000) }, cfg, now)).toBe(false);
    expect(intervalFor("cold", cfg)).toBe(1_800_000);
  });
});
