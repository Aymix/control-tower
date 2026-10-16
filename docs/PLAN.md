# Control Tower — plan

A private control room for a solo contractor who runs several client contracts
with a small team. The owner is the only face to clients; devs take tasks; Claude
Code does planning and implementation work inside each client's repos, on each
person's own Claude subscription.

## Roles

| Role  | Can                                                                                  |
|-------|--------------------------------------------------------------------------------------|
| owner | Everything. Only role that talks to clients, approves In review → Done, reopens Done, manages rules, workspaces, team, PATs, proposals. |
| dev   | Sees only workspaces they are a member of. Creates and moves tasks (except Done), comments, edits workspace rules and KB, links PRs, runs Claude sessions. |

Exactly one owner. No seed users: the first visit to `/setup` creates the owner
(gated by `SETUP_TOKEN` in production). Devs join through one-time invite links;
locked-out users get a one-time recovery link. Both are shared off-channel.

## Auth

Passkeys only (Better Auth + `@better-auth/passkey`). A user may hold several
passkeys; removing the last one is refused both in the UI and in a Better Auth
`before` hook. `DEV_LOGIN=1` (never in production) enables
`POST /api/auth/dev/login { userId }` for scripted testing.

## Data model (phase 1)

- `org_settings` (singleton): name, global rules, guardrails, style guide (each ≤ 30k chars).
- `workspace`: slug, name, client, budget, default model, rules, encrypted GitHub PAT (+ last 4), poll error, task counter.
- `workspace_member`, `repo` (owner/name, default branch, push access, check error).
- `kb_document` + `kb_version`: kinds scope / architecture / decisions / meeting_notes / plan / source_snapshot; pinnable, archivable, every save is a new version.
- `task`: per-workspace number (T-n), status (backlog / in_progress / blocked / in_review / done), blocked reason, priority, assignee, one level of `parent_id`, position. `task_blocker` for blocked-by links.
- `comment`: kind user / system / agent, markdown.
- `pull_request`: linked by branch `t<number>-slug` or pasted URL; state, draft, CI, mergeable, ±lines, head SHA, poll priority hot/warm/cold, last polled, poll error.
- `proposal_batch` + `proposal`: work detection output (planning / breakdown / manual). Statuses pending / accepted / merged / discarded, `resulting_task_id`.
- `invite`, `recovery_link` (token hashes only), `audit_log`.

## Task rules (pure, unit-tested in `src/lib/tasks/transitions.ts`)

- Anyone moves between Backlog / In progress / Blocked / In review.
- Blocked requires a non-empty reason (dialog on the board, dialog on the task page).
- Done is reachable only from In review and only by the owner. Only the owner reopens Done.
- Every transition writes a system comment; assignment changes do too.

## PR polling

A pg-boss worker (`pnpm worker`) runs two cron jobs:

- `prs.poll` every minute: polls PRs that are due by priority
  (hot = open and active in the last 2h or linked task in review, every 60s;
  warm = quiet open PR, every 5 min; cold = merged/closed/stale, every 30 min).
- `prs.discover` every 2 minutes: lists open PRs per registered repo and links
  those whose branch is `t<number>-…` to the matching task.

A merge adds a system comment to the task. Poll failures are stored on the
workspace and shown as a banner on every workspace page until a poll succeeds.

## Diff viewer

The PR page fetches the unified diff from GitHub with the workspace PAT, parses
it (`src/lib/diff/parse.ts`) and renders unified or side-by-side views; the
preference is remembered per browser.

## Work detection

Proposals come from planning sessions and task breakdowns (phase 2 runner
tools) or a manual breakdown form. Each has a title, what to do, acceptance
criteria and dependencies on sibling proposals. The owner accepts (as task or
subtask of the source task), edits, merges into an existing task (appends to its
description) or discards. Dependencies between accepted proposals become
blocked-by links. Creating tasks manually stays the default path.

## Claude sessions (phase 2)

**Where they run.** On each person's own machine, in `pnpm runner`, under that machine's
`claude login` and git credentials. The server never holds Claude credentials and never
proxies model traffic; it only hands the runner a context pack and receives events.
The runner refuses to start when `ANTHROPIC_API_KEY` is set (override: `TOWER_ALLOW_API_KEY=1`)
and fails a session whose init reports an API-key source. Managed Agents are not used.

**Policy note (checked 2026-10-15).** Anthropic's Claude Code legal page says OAuth
(subscription) auth is "intended exclusively … to support ordinary use of Claude Code and
other native Anthropic applications", that developers building products on the Agent SDK
"should use API key authentication", and that third parties may not "offer Claude.ai login
into their own applications, or … route requests through Free, Pro, or Max plan credentials
on behalf of their users" or "collect, store, or intermediate Claude.ai credentials". It also
says this does not prevent "an end user from signing in to the unmodified Claude Code binary
with their own Claude subscription". Control Tower is designed to stay on the permitted side:
one runner per person, on that person's machine, with their own login; no credential ever
leaves the machine; no usage is resold or shared. If you ever distribute this to people
outside your own team as a product, switch runners to API keys.

**Lifecycle.** queued → claimed (runner poll) → starting (worktree) → running → idle
(turn finished, resumable) / interrupted / budget_reached / failed / completed.
Follow-ups while attached stream into the same SDK session; after `RUNNER_IDLE_MS` the runner
detaches, and a later follow-up re-queues the session sticky to the same runner, which
resumes it with the stored `sdk_session_id`. The worker reaper fails sessions silent for
`SESSION_SILENT_MINUTES` and interrupts sessions older than `SESSION_MAX_HOURS`.

**Git.** Bare-clone cache per repo plus one worktree per session. Implementation sessions
branch `t<n>-slug` from the default branch (or check out the existing remote branch).
Worktrees are removed on completion unless they hold unpushed commits or uncommitted changes.

**Guards (PreToolUse hooks, unit-tested in `src/lib/guards/bash.ts`).** No force pushes,
no history rewrites, no deleting branches, no pushing to or checking out the default
branch, no destructive commands outside the worktree, no writes outside the worktree.
Planning sessions deny Write/Edit and redirects and allowlist read-only commands, tests,
lint and typecheck.

**Tools (in-process MCP server `tower`, strictMcpConfig).** `report_blocker` (Blocked +
agent comment), `submit_plan` (KB doc "Plan: T-n …" + proposal batch), `open_pull_request`
(PR via the workspace PAT, task → In review). Tool calls are forwarded to the server; the
PAT never reaches the runner.

**Transcript.** The runner posts compact events (init, assistant blocks, tool results,
guards, git, result, status) in order; the web app streams them over SSE and resumes from
the last sequence number on reload. Partial text is shown live and replaced by the final
message.

**Usage.** Each result carries the SDK's cumulative usage; the server stores deltas in a
ledger per workspace and session. Workspace budgets block new sessions when exceeded.

## Briefings (phase 3)

Client-facing text the owner sends by hand: status updates, pre-task questions, blockers
and release notes. A briefing creates a drafting session of kind `briefing` on the owner's
runner (same lifecycle as other sessions, no repo, no file or shell tools, a single
`submit_briefing` MCP tool). The prompt (`src/lib/briefings/pack.ts`, unit-tested) carries
the kind's guide, the owner's style guide, the board snapshot, PRs from the last two weeks,
recent transitions, pinned KB docs, the bound task's discussion, the last two sent briefings
of the same kind (to avoid repetition) and up to three earlier draft → sent pairs so the
model learns how the owner edits. The owner edits in place, marks it sent (recording the
pair in `briefing_edit`), regenerates with feedback, or discards. Nothing is sent by the app.

## Phases

1. **Core PM + GitHub** (this repo state): auth, workspaces, rules, KB, board,
   tasks, comments, PRs + poller + diff viewer, inbox, proposals, audit log, UI shell.
2. **Claude sessions**: per-user runners on personal Claude subscriptions, planning
   (read-only) and implementation (branch / commit / push / PR) sessions, live
   transcript over SSE, steering, interrupt, resume, context pack, MCP tools
   (`open_pull_request`, `report_blocker`, `submit_plan`), PreToolUse guards, usage ledger.
3. **Briefings** (built): status updates, pre-task questions, blockers and release notes
   drafted in the owner's voice; owner edits and sends; learns from edits.
4. **External sources**: URL / Notion / Confluence / Google snapshots into the KB,
   CLAUDE.md sync with client repos.

## Stack

Next.js 16 (App Router, server actions), Postgres 16, Drizzle, Better Auth
(passkeys), pg-boss, Octokit, shadcn/ui + Tailwind 4, vitest, Playwright for
screenshots. mise pins node 22 + pnpm 10. Deploy: Docker Compose + Caddy; the
web container runs migrations on boot.
