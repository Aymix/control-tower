# Phase 2 manual checklist — Claude sessions on personal runners

Prereqs: phase 1 running (`pnpm dev`, `pnpm worker`), a workspace with a GitHub PAT and
a registered repo you can push to, and `claude login` done on the runner machine.

## Runner

- [ ] Account → Runners → "Create runner token": the token is shown once with a ready-to-paste command.
- [ ] `TOWER_URL=http://localhost:3000 TOWER_RUNNER_TOKEN=ctr_… pnpm runner` prints the auth method and "connected … as <you>".
- [ ] The runner row flips to **Online** within a few seconds and shows hostname, capacity and Claude Code version.
- [ ] With `ANTHROPIC_API_KEY` exported, the runner refuses to start (exit 2). With `TOWER_ALLOW_API_KEY=1` it starts and the row shows **API key** after the first session.
- [ ] Stop the runner: the row shows **Offline** after ~90s.
- [ ] Revoke the token while the runner is running: it exits with "Runner token was revoked".

## Planning session (read-only)

- [ ] Task page → "Plan with Claude" with an instruction. The session page opens, status Queued → Starting → Running; the transcript streams live (text appears as Claude writes).
- [ ] The init line shows `auth none` or `auth oauth` (Claude plan), never `ANTHROPIC_API_KEY`.
- [ ] Ask Claude (in the instruction) to create a file: the guard blocks Write/Edit and the transcript shows a red "Blocked" line.
- [ ] A Bash `echo x > file` is blocked (redirect); `pnpm test`, `rg`, `git log` run.
- [ ] Claude calls `submit_plan`: a KB document "Plan: T-n …" appears (kind plan), and Proposals shows a Planning batch linked to the task. Accept one as a subtask.
- [ ] The session turns **Idle** after the result; the Usage tab shows tokens and estimated cost.
- [ ] Reload the session page mid-run: the transcript resumes from the last event without duplicates.
- [ ] Send a follow-up while Idle (runner still attached): Claude continues in the same SDK session.
- [ ] Wait past `RUNNER_IDLE_MS` (default 10 min; set `RUNNER_IDLE_MS=20000` to test): the runner detaches. Send another follow-up: the session re-queues, the same runner resumes it with `resume`, and the transcript continues.

## Implementation session

- [ ] "Implement with Claude" on a task with a repo: the runner creates a bare clone under `~/.tower-runner/repos` and a worktree under `~/.tower-runner/worktrees/<session>` on branch `t<n>-slug`.
- [ ] `git push --force`, `git push origin main`, `git checkout main`, `git rebase`, `rm -rf /tmp/x` are blocked (red Blocked lines); normal `git add/commit/push -u origin t<n>-…` works.
- [ ] Writing outside the worktree is blocked.
- [ ] Claude calls `open_pull_request`: the PR is created with the workspace PAT, linked to the task, the task moves to **In review**, an agent comment links the PR, and the session header links the PR.
- [ ] Claude calls `report_blocker`: the task becomes **Blocked** with the reason and shows in the owner inbox.
- [ ] Interrupt during a long turn: status **Interrupted**; a follow-up resumes.
- [ ] End the session: status **Completed**; the worktree is removed unless it has unpushed commits (then it is kept and the header says so).

## Budgets and limits

- [ ] Start a session with max budget $0.05: it ends with **Budget reached**.
- [ ] Set the workspace budget below the current spend: starting a session is refused with a clear message; Usage shows the bar at 100%.
- [ ] Kill the runner process mid-run: after 5 minutes the worker marks the session **Failed** ("runner went silent") and comments on the task.
- [ ] `SESSION_MAX_HOURS=0.01` (36 s): a running session gets interrupted by the reaper.

## Isolation

- [ ] Personal MCP connectors/plugins from `~/.claude` do not appear in the session's tool list (strictMcpConfig + settingSources []).
- [ ] A dev's runner only picks up sessions that dev created; the owner's sessions wait for the owner's runner.
