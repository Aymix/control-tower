import "dotenv/config";
import { PgBoss } from "pg-boss";
import { and, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { pullRequest, repo, workspace } from "@/db/schema";
import { env } from "@/lib/env";
import { discoverPullsForRepo, syncPullById } from "@/server/prs/sync";
import { reapSessions } from "@/server/sessions/service";

export const QUEUE_POLL = "prs.poll";
export const QUEUE_DISCOVER = "prs.discover";
export const QUEUE_REAP = "sessions.reap";

/** Closed or merged PRs stop being polled after this long (re-opens are rare). */
const COLD_RETIRE_DAYS = 7;

const log = (m: string) => console.log(`[worker ${new Date().toISOString().slice(11, 19)}] ${m}`);

export async function pollDuePulls(): Promise<{ due: number; ok: number; skipped: number }> {
  const cfg = env();
  const now = new Date();
  const ago = (s: number) => new Date(now.getTime() - s * 1000);
  const retire = new Date(now.getTime() - COLD_RETIRE_DAYS * 86_400_000);
  const due = await db
    .select({ id: pullRequest.id, workspaceId: pullRequest.workspaceId })
    .from(pullRequest)
    .innerJoin(workspace, eq(workspace.id, pullRequest.workspaceId))
    .where(
      and(
        isNotNull(workspace.githubPatEnc),
        isNull(workspace.archivedAt),
        // retire long-closed PRs
        or(eq(pullRequest.state, "open"), isNull(pullRequest.closedAt), gt(pullRequest.closedAt, retire)),
        or(
          isNull(pullRequest.lastPolledAt),
          and(eq(pullRequest.pollPriority, "hot"), lte(pullRequest.lastPolledAt, ago(cfg.PR_POLL_HOT_SECONDS))),
          and(eq(pullRequest.pollPriority, "warm"), lte(pullRequest.lastPolledAt, ago(cfg.PR_POLL_WARM_SECONDS))),
          and(eq(pullRequest.pollPriority, "cold"), lte(pullRequest.lastPolledAt, ago(cfg.PR_POLL_COLD_SECONDS))),
        ),
      ),
    )
    .orderBy(sql`case ${pullRequest.pollPriority} when 'hot' then 0 when 'warm' then 1 else 2 end`, pullRequest.lastPolledAt)
    .limit(50);
  let ok = 0;
  let skipped = 0;
  const failedWorkspaces = new Set<string>();
  for (const { id, workspaceId } of due) {
    if (failedWorkspaces.has(workspaceId)) {
      skipped++;
      continue; // token or rate-limit problem: don't hammer GitHub for the same workspace this tick
    }
    const r = await syncPullById(id);
    if (r.ok) ok++;
    else if (/401|403|rate limit/i.test(r.error ?? "")) failedWorkspaces.add(workspaceId);
  }
  return { due: due.length, ok, skipped };
}

export async function discoverAll(): Promise<{ repos: number; linked: number; errors: string[] }> {
  const repos = await db
    .select({ id: repo.id, owner: repo.owner, name: repo.name })
    .from(repo)
    .innerJoin(workspace, eq(workspace.id, repo.workspaceId))
    .where(and(isNotNull(workspace.githubPatEnc), isNull(workspace.archivedAt)));
  let linked = 0;
  const errors: string[] = [];
  for (const r of repos) {
    const res = await discoverPullsForRepo(r.id);
    linked += res.linked;
    if (res.error) errors.push(`${r.owner}/${r.name}: ${res.error}`);
  }
  return { repos: repos.length, linked, errors };
}

async function main() {
  const boss = new PgBoss({ connectionString: env().DATABASE_URL, schema: "pgboss" });
  boss.on("error", (err: unknown) => console.error("[worker] pg-boss error", err));
  await boss.start();
  for (const q of [QUEUE_POLL, QUEUE_DISCOVER, QUEUE_REAP]) await boss.createQueue(q);
  await boss.schedule(QUEUE_POLL, "* * * * *");
  await boss.schedule(QUEUE_DISCOVER, "*/2 * * * *");
  await boss.schedule(QUEUE_REAP, "* * * * *");

  await boss.work(QUEUE_POLL, { batchSize: 1 }, async () => {
    const r = await pollDuePulls();
    if (r.due) log(`poll: ${r.due} PR(s) due, ${r.ok} ok, ${r.skipped} skipped`);
  });
  await boss.work(QUEUE_DISCOVER, { batchSize: 1 }, async () => {
    const r = await discoverAll();
    if (r.linked) log(`discover: linked ${r.linked} PR(s) across ${r.repos} repo(s)`);
    for (const e of r.errors) console.warn(`[worker] discover: ${e}`);
  });
  await boss.work(QUEUE_REAP, { batchSize: 1 }, async () => {
    const r = await reapSessions();
    if (r.silent || r.tooLong) log(`reaper: failed ${r.silent} silent session(s), interrupted ${r.tooLong} over the max duration`);
  });

  // Run each job once at startup so a fresh deploy does not wait a full minute.
  await boss.send(QUEUE_POLL, {});
  await boss.send(QUEUE_DISCOVER, {});
  await boss.send(QUEUE_REAP, {});

  log(`started: PR poll every minute (hot ${env().PR_POLL_HOT_SECONDS}s / warm ${env().PR_POLL_WARM_SECONDS}s / cold ${env().PR_POLL_COLD_SECONDS}s), discovery every 2 min, session reaper every minute (silent ${env().SESSION_SILENT_MINUTES} min, max ${env().SESSION_MAX_HOURS} h)`);

  const shutdown = async () => {
    log("stopping");
    await boss.stop({ graceful: true, timeout: 10_000 });
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1]?.endsWith("src/worker/index.ts") || process.argv[1]?.includes("worker")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
