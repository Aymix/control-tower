# Control Tower

Private project-management space for running several client contracts with a
small team and Claude Code. See [`docs/PLAN.md`](docs/PLAN.md) for the design and
phases, and [`tests/e2e/phase-1.md`](tests/e2e/phase-1.md) for the manual checklist.

## Local development

```bash
mise install                 # node 22 + pnpm 10
pnpm install
cp .env.example .env         # then fill MASTER_KEY and BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d db      # Postgres 16 on localhost:5433
pnpm db:migrate
pnpm dev                     # http://localhost:3000
pnpm worker                  # PR poller (second terminal)
```

First visit: `http://localhost:3000/setup` creates the owner account and asks for a passkey.
There are no seed users. Set `DEV_LOGIN=1` in `.env` to get a passwordless "dev login"
on the login page (ignored in production).

## Runner (Claude sessions)

Each person runs a runner on their own machine, logged into their own Claude subscription:

```bash
claude login                                  # once, on the runner machine
# Account → Runners → Create runner token, then:
TOWER_URL=https://tower.example.com TOWER_RUNNER_TOKEN=ctr_… pnpm runner
```

Runner settings: `RUNNER_CAPACITY` (parallel sessions, default 1), `RUNNER_IDLE_MS` (detach after
idle, default 600000), `TOWER_RUNNER_HOME` (default `~/.tower-runner`), `TOWER_GIT_PROTOCOL`
(`ssh` default or `https`), `TOWER_GIT_BASE` (override clone base, e.g. a mirror),
`RUNNER_KEEP_WORKTREES=1`, `TOWER_ALLOW_API_KEY=1` (otherwise an API key is refused).
See `tests/e2e/phase-2.md` and the policy note in `docs/PLAN.md`.

Useful scripts:

| Script              | What                                                       |
|---------------------|------------------------------------------------------------|
| `pnpm test`         | vitest unit tests (transitions, branch linking, polling priority, diff parsing, crypto) |
| `pnpm typecheck`    | `tsc --noEmit`                                             |
| `pnpm lint`         | eslint                                                     |
| `pnpm db:generate`  | create a migration from `src/db/schema.ts`                 |
| `pnpm db:migrate`   | apply migrations                                           |
| `pnpm runner`       | start a runner on this machine (needs `TOWER_URL`, `TOWER_RUNNER_TOKEN`) |
| `pnpm shots`        | seed a demo workspace and screenshot every page to `shots/` (needs `pnpm dev` + `DEV_LOGIN=1`) |

## Production (Docker Compose + Caddy)

```bash
cp .env.example .env.prod    # set APP_URL=https://tower.example.com, DOMAIN, SETUP_TOKEN, secrets
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Caddy terminates TLS for `DOMAIN` automatically. The `web` container runs
`drizzle-kit migrate` on boot, then starts Next.js; `worker` runs the poller.
Open `https://<DOMAIN>/setup` once with the `SETUP_TOKEN` to create the owner.

## Layout

```
src/app            routes (App Router). (auth)/login, setup, invite, recover, (app)/…
src/components     UI: shell, board (dnd-kit), tasks, diff viewer, forms
src/server         server actions, queries, GitHub client, PR sync, auth helpers
src/lib            pure logic (transitions, branch names, poll priority, diff parsing, crypto, env)
src/db             Drizzle schema + client; migrations in ./drizzle
src/worker         pg-boss worker
scripts/shots.ts   Playwright screenshots
tests/unit         vitest
```
