# Phase 1 manual checklist

Run with `docker compose up -d db`, `pnpm db:migrate`, `pnpm dev` and
`pnpm worker` in a second terminal. Use a real browser for passkey steps.
`DEV_LOGIN=1` in `.env` lets you switch users from the login page.

## Setup and auth

- [ ] Fresh DB: visiting `/` redirects to `/login`, which redirects to `/setup`.
- [ ] `/setup` creates the owner, then prompts for a passkey. Registering one lands on `/inbox`.
- [ ] A second POST to `/api/auth/tower/setup` returns 409. `/setup` now redirects to `/login`.
- [ ] With `NODE_ENV=production` and no/incorrect `SETUP_TOKEN`, setup returns 403.
- [ ] Sign out, then "Sign in with a passkey" works (and the browser offers autofill if supported).
- [ ] `/account`: add a second passkey, rename it, delete one. Deleting the last one is refused.
- [ ] `/account` → create an invite link scoped to a workspace. Open it in a private window: new dev account + passkey. The dev lands on `/inbox` and sees only that workspace.
- [ ] Used or expired invite links show "Invite not valid".
- [ ] Owner creates a recovery link for the dev. Opening it signs the dev in once and lets them add a passkey. Opening it again fails.
- [ ] `POST /api/auth/dev/login` returns 404 when `DEV_LOGIN` is not `1`.

## Workspaces and rules

- [ ] `/settings`: create a workspace; it appears in the sidebar and opens on `/w/<slug>`.
- [ ] Global rules / guardrails / style guide save; the counter turns red past 30,000 chars and save is refused.
- [ ] Workspace settings: name, client, model, budget save. Archive hides it from the sidebar (still reachable); unarchive restores it.
- [ ] Add a fine-grained PAT: an invalid token is rejected; a valid one shows `••••XXXX`. Remove it.
- [ ] Add the dev as a member, remove them; the dev's sidebar updates accordingly.
- [ ] `/w/<slug>/rules`: a dev can edit workspace rules; org rules are read-only there.

## Knowledge base

- [ ] Create a document (kind, title, markdown). It renders with headings, lists, code.
- [ ] Edit → "Save new version" creates v2; the versions sidebar lets you view v1.
- [ ] Pin / unpin shows it on the workspace overview. Archive hides it from the list (toggle "Archived").

## Board and tasks

- [ ] "New task" creates T-1, T-2… with per-workspace numbering, and opens the task page.
- [ ] Drag a card Backlog → In progress: the card moves, a system comment appears on the task.
- [ ] Drag to Blocked: a reason dialog opens; cancel reverts the card, confirming blocks with the reason on the card and in the owner inbox.
- [ ] Dev drags In review → Done: refused with a toast. Owner can.
- [ ] Dev tries to move a Done task: refused. Owner can reopen.
- [ ] Reorder within a column and reload: the order persists.
- [ ] Task page: edit title/description/priority/assignee; assignment adds a system comment.
- [ ] Add a subtask: the parent card shows `0/1`, then `1/1` when the subtask is Done. A subtask cannot get its own subtask.
- [ ] Add "Blocked by T-n": a chip appears on the card and the task page; removing it works.
- [ ] Comments render markdown; system / agent / user comments have distinct icons.
- [ ] Owner can delete a task; devs do not see the button.
- [ ] "Hide subtasks" on the board hides child cards.

## Pull requests

- [ ] With a PAT and a registered repo: push a branch `t<number>-anything` and open a PR. Within 2 minutes the task shows the PR (or click "Re-check" on the repo).
- [ ] Paste a PR URL on a task: it links; pasting it on another task is refused.
- [ ] PR page shows state, CI, mergeability, ±lines; unified and side-by-side diff toggle and the choice survives reload.
- [ ] Merge the PR on GitHub: the next poll marks it merged and adds a system comment.
- [ ] Revoke the PAT on GitHub: the workspace shows the amber polling banner; fixing the token clears it after a successful poll.
- [ ] `/w/<slug>/prs` lists open and merged/closed PRs with poll priority.

## Inbox

- [ ] Owner inbox lists in-review and blocked tasks across all workspaces plus recent updates. Sidebar badge matches.
- [ ] Dev inbox lists only their assigned tasks.

## Proposals

- [ ] Manual breakdown with 3 lines creates a pending batch.
- [ ] Accept one as a task (lands in Backlog with description + acceptance criteria).
- [ ] With a source task selected, "Accept as subtask" creates a child of it.
- [ ] Edit a proposal, merge another into an existing task (its description grows, a system comment is added), discard the last.
- [ ] Dev sees proposals but has no decision buttons.

## Audit

- [ ] `/settings/audit` lists the actions above with actor and workspace.

## UI

- [ ] Light/dark toggle persists across reloads. Pages are usable at 390px width (mobile nav sheet).
- [ ] `pnpm shots` produces screenshots for every page without console errors.
