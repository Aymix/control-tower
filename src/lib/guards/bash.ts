/**
 * PreToolUse guards for Bash commands run by Claude sessions.
 * Pure functions so they can be unit-tested; the runner wires them into hooks.
 */

export type GuardVerdict = { allow: true } | { allow: false; reason: string };

export type BashGuardContext = {
  kind: "planning" | "implementation";
  worktree: string; // absolute path of the session worktree
  defaultBranch: string;
  sessionBranch: string | null;
};

const ALLOW = { allow: true } as const;
const deny = (reason: string): GuardVerdict => ({ allow: false, reason });

/** Splits a shell line on command separators, keeping it simple on purpose. */
export function splitCommands(command: string): string[] {
  return command
    .replace(/\\\n/g, " ")
    .split(/\s*(?:&&|\|\||;|\||\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokens(cmd: string): string[] {
  return cmd.replace(/^\s*(sudo|env|command|exec|time)\s+/, "").split(/\s+/).filter(Boolean);
}

export function checkGitCommand(cmd: string, ctx: BashGuardContext): GuardVerdict {
  const t = tokens(cmd);
  if (t[0] !== "git") return ALLOW;
  // Drop global options like -C <path> or -c key=val before the subcommand.
  let i = 1;
  while (i < t.length && t[i].startsWith("-")) {
    if (t[i] === "-C" || t[i] === "-c" || t[i] === "--git-dir" || t[i] === "--work-tree") i += 2;
    else i += 1;
  }
  const sub = t[i];
  const args = t.slice(i + 1);
  const argStr = args.join(" ");
  const has = (flag: string) => args.includes(flag);

  if (sub === "push") {
    if (has("--force") || has("-f") || has("--force-with-lease") || args.some((a) => /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)) || args.some((a) => a.startsWith("+")))
      return deny("Force pushes are not allowed.");
    if (has("--delete") || has("-d") || args.some((a) => /^:\S+/.test(a))) return deny("Deleting remote branches is not allowed.");
    if (has("--mirror")) return deny("Mirror pushes are not allowed.");
    const refspecs = args.filter((a) => !a.startsWith("-"));
    // git push origin main | git push origin HEAD:main | git push (on default branch)
    for (const r of refspecs.slice(1)) {
      const dst = r.includes(":") ? r.split(":")[1] : r;
      if (dst === ctx.defaultBranch || dst === `refs/heads/${ctx.defaultBranch}`) return deny(`Pushing to the default branch (${ctx.defaultBranch}) is not allowed.`);
    }
    if (refspecs.length <= 1 && ctx.sessionBranch === null) return deny("Push an explicit session branch (git push -u origin <branch>).");
    return ALLOW;
  }
  if (sub === "reset" && (has("--hard") || has("--merge") || has("--keep"))) return deny("History rewrites (git reset --hard) are not allowed.");
  if (sub === "rebase") return deny("Rebasing is not allowed; merge the default branch instead.");
  if (sub === "commit" && (has("--amend"))) return deny("Amending commits is not allowed; make a new commit.");
  if (sub === "branch" && (has("-D") || has("-d") || has("--delete") || args.some((a) => /^-[a-zA-Z]*[dD][a-zA-Z]*$/.test(a)))) return deny("Deleting branches is not allowed.");
  if (sub === "checkout" || sub === "switch") {
    const target = args.filter((a) => !a.startsWith("-")).at(-1);
    if (target === ctx.defaultBranch) return deny(`Checking out the default branch (${ctx.defaultBranch}) is not allowed; work on the session branch.`);
    if (sub === "checkout" && (has("--orphan"))) return deny("Orphan branches are not allowed.");
  }
  if (sub === "filter-branch" || sub === "filter-repo" || sub === "replace") return deny("History rewriting commands are not allowed.");
  if (sub === "reflog" && /expire|delete/.test(argStr)) return deny("Reflog expiry is not allowed.");
  if (sub === "gc" && has("--prune=now")) return deny("Aggressive gc is not allowed.");
  if (sub === "update-ref" && has("-d")) return deny("Deleting refs is not allowed.");
  if (sub === "clean" && !/-[a-zA-Z]*n/.test(argStr)) return deny("git clean is not allowed (use the dry run -n to inspect).");
  if (sub === "stash" && (args[0] === "drop" || args[0] === "clear")) return deny("Dropping stashes is not allowed.");
  if (sub === "worktree" && (args[0] === "remove" || args[0] === "prune")) return deny("Managing worktrees is reserved for the runner.");
  return ALLOW;
}

/** Destructive filesystem commands must stay inside the worktree. */
export function checkDestructiveCommand(cmd: string, ctx: BashGuardContext): GuardVerdict {
  const t = tokens(cmd);
  const bin = t[0];
  const destructive = new Set(["rm", "rmdir", "shred", "unlink", "mkfs", "dd", "truncate", "chmod", "chown", "mv"]);
  if (!bin || !destructive.has(bin)) return ALLOW;
  if (bin === "mkfs" || bin === "dd") return deny(`${bin} is not allowed.`);
  const targets = t.slice(1).filter((a) => !a.startsWith("-"));
  for (const target of targets) {
    if (target === "/" || target === "~" || target === "$HOME" || target.startsWith("/*")) return deny(`${bin} on ${target} is not allowed.`);
    if (target.startsWith("/") && !isInside(target, ctx.worktree)) return deny(`${bin} outside the session worktree is not allowed (${target}).`);
    if (target.startsWith("~") || target.startsWith("$HOME")) return deny(`${bin} in the home directory is not allowed.`);
    if (target.split("/").includes("..")) return deny(`${bin} with parent-directory paths is not allowed (${target}).`);
  }
  return ALLOW;
}

export function isInside(path: string, root: string): boolean {
  const norm = (p: string) => p.replace(/\/+$/, "") + "/";
  return norm(path).startsWith(norm(root));
}

const PLANNING_ALLOWED_BINS = new Set([
  "ls", "cat", "head", "tail", "less", "more", "wc", "grep", "rg", "egrep", "fgrep", "find", "fd", "tree", "stat", "file", "du", "df",
  "echo", "printf", "pwd", "which", "type", "env", "printenv", "date", "whoami", "uname", "true", "false", "test", "sort", "uniq", "cut",
  "awk", "sed", "tr", "diff", "comm", "xargs", "jq", "yq", "basename", "dirname", "realpath", "readlink", "md5", "md5sum", "sha256sum",
  "node", "npm", "pnpm", "yarn", "npx", "bun", "deno", "python", "python3", "pip", "pytest", "go", "cargo", "make", "mvn", "gradle", "dotnet",
  "ruby", "bundle", "rake", "php", "composer", "tsc", "eslint", "prettier", "vitest", "jest", "mocha", "ruff", "mypy", "black", "flake8",
  "git", "gh", "cd", "export", "set", "unset", "sleep", "mise", "docker",
]);
const PLANNING_DENIED_GIT = new Set(["push", "commit", "add", "rm", "mv", "checkout", "switch", "merge", "reset", "rebase", "cherry-pick", "revert", "tag", "stash", "apply", "am", "restore", "clean"]);
const PLANNING_DENIED_NPM = /^(npm|pnpm|yarn|bun)\s+(publish|login|logout|adduser|deprecate|unpublish|link)\b/;
const PLANNING_DENIED_DOCKER = /^docker\s+(rm|rmi|push|login|system|volume|network)\b/;

/** Planning sessions are read-only: allowlisted commands, no redirects, no git mutations. */
export function checkPlanningCommand(cmd: string): GuardVerdict {
  const raw = cmd.trim();
  const cleaned = raw.replace(/\d?>&\d/g, "").replace(/\d?>>?\s*\/dev\/null/g, "");
  if (/(^|[^<>])>{1,2}(?!&)/.test(cleaned)) return deny("Planning sessions are read-only: output redirection to files is not allowed.");
  if (/\btee\b/.test(raw)) return deny("Planning sessions are read-only: tee is not allowed.");
  const t = tokens(raw);
  const bin = t[0];
  if (!bin) return ALLOW;
  if (!PLANNING_ALLOWED_BINS.has(bin)) return deny(`Planning sessions are read-only: '${bin}' is not in the allowlist.`);
  if (bin === "git" && PLANNING_DENIED_GIT.has(t[1])) return deny(`Planning sessions are read-only: git ${t[1]} is not allowed.`);
  if (bin === "gh" && /^(pr|issue|release|repo)\s+(create|merge|close|delete|edit|comment)/.test(t.slice(1).join(" "))) return deny("Planning sessions are read-only: gh mutations are not allowed.");
  if (PLANNING_DENIED_NPM.test(raw)) return deny("Planning sessions are read-only: package publishing is not allowed.");
  if (PLANNING_DENIED_DOCKER.test(raw)) return deny("Planning sessions are read-only: docker mutations are not allowed.");
  if ((bin === "sed" && /\s-i\b/.test(raw)) || (bin === "find" && /-delete\b|-exec\s+rm/.test(raw)) || (bin === "xargs" && /\brm\b/.test(raw))) return deny("Planning sessions are read-only: in-place edits and deletions are not allowed.");
  if (bin === "rm" || bin === "mv" || bin === "cp" || bin === "touch" || bin === "mkdir" || bin === "chmod") return deny(`Planning sessions are read-only: ${bin} is not allowed.`);
  return ALLOW;
}

/** Full verdict for one Bash tool call. */
export function checkBash(command: string, ctx: BashGuardContext): GuardVerdict {
  for (const part of splitCommands(command)) {
    if (ctx.kind === "planning") {
      const p = checkPlanningCommand(part);
      if (!p.allow) return p;
    }
    const g = checkGitCommand(part, ctx);
    if (!g.allow) return g;
    const d = checkDestructiveCommand(part, ctx);
    if (!d.allow) return d;
  }
  return ALLOW;
}

/** File tools (Write/Edit/NotebookEdit): planning denies all; implementation must stay in the worktree. */
export function checkFileWrite(filePath: string | undefined, ctx: BashGuardContext): GuardVerdict {
  if (ctx.kind === "planning") return deny("Planning sessions are read-only: use submit_plan to hand back a plan instead of editing files.");
  if (!filePath) return ALLOW;
  const abs = filePath.startsWith("/") ? filePath : `${ctx.worktree.replace(/\/$/, "")}/${filePath}`;
  if (!isInside(abs, ctx.worktree)) return deny(`Writing outside the session worktree is not allowed (${filePath}).`);
  if (/(^|\/)\.git\//.test(abs)) return deny("Editing .git internals is not allowed.");
  return ALLOW;
}
