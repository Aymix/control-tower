import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { RunnerConfig } from "./config";

export async function sh(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env, GIT_TERMINAL_PROMPT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

export async function git(args: string[], cwd?: string): Promise<string> {
  const r = await sh("git", args, { cwd });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

export function cloneUrl(cfg: RunnerConfig, owner: string, name: string): string {
  if (cfg.gitBase) return `${cfg.gitBase}/${owner}/${name}.git`;
  return cfg.gitProtocol === "https" ? `https://github.com/${owner}/${name}.git` : `git@github.com:${owner}/${name}.git`;
}

export function cachePath(cfg: RunnerConfig, owner: string, name: string): string {
  return path.join(cfg.home, "repos", `${owner}__${name}.git`);
}

export function worktreePath(cfg: RunnerConfig, sessionId: string): string {
  return path.join(cfg.home, "worktrees", sessionId);
}

/** Ensures a bare clone exists and is up to date for the default branch. */
export async function ensureCache(cfg: RunnerConfig, owner: string, name: string, log: (m: string) => void): Promise<string> {
  const dir = cachePath(cfg, owner, name);
  await mkdir(path.dirname(dir), { recursive: true });
  if (!existsSync(dir)) {
    log(`cloning ${owner}/${name} (bare)`);
    await git(["clone", "--bare", cloneUrl(cfg, owner, name), dir]);
    await git(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], dir);
  }
  log(`fetching ${owner}/${name}`);
  await git(["fetch", "--prune", "origin"], dir);
  return dir;
}

/**
 * Creates (or reuses) the session worktree on the session branch.
 * Implementation: branch from origin/<default> unless the branch already exists on origin.
 * Planning: detached checkout of origin/<default>.
 */
export async function ensureWorktree(
  cfg: RunnerConfig,
  input: { sessionId: string; owner: string; name: string; defaultBranch: string; branch: string | null; kind: "planning" | "implementation" },
  log: (m: string) => void,
): Promise<{ path: string; branch: string | null }> {
  const cache = await ensureCache(cfg, input.owner, input.name, log);
  const wt = worktreePath(cfg, input.sessionId);
  await mkdir(path.dirname(wt), { recursive: true });
  if (existsSync(wt)) {
    log(`reusing worktree ${wt}`);
    return { path: wt, branch: input.branch };
  }
  const base = `origin/${input.defaultBranch}`;
  if (input.kind === "planning" || !input.branch) {
    await git(["worktree", "add", "--detach", wt, base], cache);
    return { path: wt, branch: null };
  }
  const remoteBranch = await sh("git", ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${input.branch}`], { cwd: cache });
  if (remoteBranch.code === 0) {
    log(`branch ${input.branch} exists on origin; checking it out`);
    const local = await sh("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${input.branch}`], { cwd: cache });
    if (local.code === 0) await git(["worktree", "add", wt, input.branch], cache);
    else await git(["worktree", "add", "-b", input.branch, wt, `origin/${input.branch}`], cache);
  } else {
    const local = await sh("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${input.branch}`], { cwd: cache });
    if (local.code === 0) await git(["worktree", "add", wt, input.branch], cache);
    else await git(["worktree", "add", "-b", input.branch, wt, base], cache);
  }
  await git(["config", "push.default", "upstream"], wt);
  await git(["config", "branch." + input.branch + ".remote", "origin"], wt);
  await git(["config", "branch." + input.branch + ".merge", "refs/heads/" + input.branch], wt);
  return { path: wt, branch: input.branch };
}

export async function hasUnpushedCommits(wt: string, branch: string | null): Promise<boolean> {
  if (!branch) return false;
  const r = await sh("git", ["rev-list", "--count", `origin/${branch}..HEAD`], { cwd: wt });
  if (r.code !== 0) {
    // No upstream yet: unpushed if there are commits beyond the base
    const r2 = await sh("git", ["rev-list", "--count", "@{u}..HEAD"], { cwd: wt });
    if (r2.code === 0) return Number.parseInt(r2.stdout.trim(), 10) > 0;
    const r3 = await sh("git", ["log", "--oneline", "--branches", "--not", "--remotes", "-1"], { cwd: wt });
    return r3.code === 0 && r3.stdout.trim().length > 0;
  }
  return Number.parseInt(r.stdout.trim(), 10) > 0;
}

export async function hasUncommittedChanges(wt: string): Promise<boolean> {
  const r = await sh("git", ["status", "--porcelain"], { cwd: wt });
  return r.code === 0 && r.stdout.trim().length > 0;
}

export async function removeWorktree(cfg: RunnerConfig, owner: string, name: string, wt: string, log: (m: string) => void): Promise<void> {
  const cache = cachePath(cfg, owner, name);
  const r = await sh("git", ["worktree", "remove", "--force", wt], { cwd: cache });
  if (r.code !== 0) {
    log(`worktree remove failed (${r.stderr.trim()}); deleting directory`);
    await rm(wt, { recursive: true, force: true });
    await sh("git", ["worktree", "prune"], { cwd: cache });
  }
}
