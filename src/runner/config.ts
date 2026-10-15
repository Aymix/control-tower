import os from "node:os";
import path from "node:path";

export type RunnerConfig = {
  towerUrl: string;
  token: string;
  capacity: number;
  idleMs: number;
  home: string;
  gitProtocol: "ssh" | "https";
  gitBase: string | null; // override, e.g. file:///srv/mirrors for local testing or self-hosted mirrors
  keepWorktrees: boolean;
  allowApiKey: boolean;
  pollIntervalMs: number;
  hostname: string;
};

export function loadConfig(): RunnerConfig {
  const towerUrl = (process.env.TOWER_URL ?? "").replace(/\/$/, "");
  const token = process.env.TOWER_RUNNER_TOKEN ?? "";
  if (!towerUrl || !token) {
    throw new Error("Set TOWER_URL and TOWER_RUNNER_TOKEN (create a token under Account → Runners).");
  }
  const home = path.resolve((process.env.TOWER_RUNNER_HOME ?? path.join(os.homedir(), ".tower-runner")).replace(/^~(?=$|\/)/, os.homedir()));
  return {
    towerUrl,
    token,
    capacity: Math.max(1, Number.parseInt(process.env.RUNNER_CAPACITY ?? "1", 10) || 1),
    idleMs: Math.max(10_000, Number.parseInt(process.env.RUNNER_IDLE_MS ?? "600000", 10) || 600_000),
    home,
    gitProtocol: process.env.TOWER_GIT_PROTOCOL === "https" ? "https" : "ssh",
    gitBase: process.env.TOWER_GIT_BASE?.replace(/\/$/, "") || null,
    keepWorktrees: process.env.RUNNER_KEEP_WORKTREES === "1",
    allowApiKey: process.env.TOWER_ALLOW_API_KEY === "1",
    pollIntervalMs: 2000,
    hostname: os.hostname(),
  };
}

export const RUNNER_VERSION = "0.2.0";
