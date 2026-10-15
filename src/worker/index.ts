import "dotenv/config";
import { PgBoss } from "pg-boss";
import { and, eq, isNotNull, lte, or, isNull, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { pullRequest, repo, workspace } from "@/db/schema";
import { env } from "@/lib/env";
import { discoverPullsForRepo, syncPullById } from "@/server/prs/sync";
import { reapSessions } from "@/server/sessions/service";

const QUEUE_POLL = "prs.poll";
const QUEUE_DISCOVER = "prs.discover";
const QUEUE_REAP = "sessions.reap";

async function main() {
  const boss = new PgBoss({ connectionString: env().DATABASE_URL, schema: "pgboss" });
  boss.on("error", (err: unknown) => console.error("[worker] pg-boss error", err));
  await boss.start();
  await boss.createQueue(QUEUE_POLL);
  await boss.createQueue(QUEUE_DISCOVER);
  await boss.schedule(QUEUE_POLL, "* * * * *");
  await boss.schedule(QUEUE_DISCOVER, "*/2 * * * *");
  await boss.createQueue(QUEUE_REAP);
  await boss.schedule(QUEUE_REAP, "* * * * *");

  await boss.work(QUEUE_POLL, { batchSize: 1 }, async () => {
    const cfg = env();
    const now = new Date();
    const due = await db
      .select({ id: pullRequest.id })
      .from(pullRequest)
      .innerJoin(workspace, eq(workspace.id, pullRequest.workspaceId))
      .where(
        and(
          isNotNull(workspace.githubPatEnc),
          or(
            isNull(pullRequest.lastPolledAt),
            and(eq(pullRequest.pollPriority, "hot"), lte(pullRequest.lastPolledAt, new Date(now.getTime() - cfg.PR_POLL_HOT_SECONDS * 1000))),
            and(eq(pullRequest.pollPriority, "warm"), lte(pullRequest.lastPolledAt, new Date(now.getTime() - cfg.PR_POLL_WARM_SECONDS * 1000))),
            and(eq(pullRequest.pollPriority, "cold"), lte(pullRequest.lastPolledAt, new Date(now.getTime() - cfg.PR_POLL_COLD_SECONDS * 1000))),
          ),
        ),
      )
      .orderBy(sql`case ${pullRequest.pollPriority} when 'hot' then 0 when 'warm' then 1 else 2 end`, pullRequest.lastPolledAt)
      .limit(50);
    let okCount = 0;
    for (const { id } of due) {
      const r = await syncPullById(id);
      if (r.ok) okCount++;
    }
    if (due.length) console.log(`[worker] polled ${due.length} PRs (${okCount} ok)`);
  });

  await boss.work(QUEUE_DISCOVER, { batchSize: 1 }, async () => {
    const repos = await db
      .select({ id: repo.id, owner: repo.owner, name: repo.name })
      .from(repo)
      .innerJoin(workspace, eq(workspace.id, repo.workspaceId))
      .where(and(isNotNull(workspace.githubPatEnc), isNull(workspace.archivedAt)));
    for (const r of repos) {
      const res = await discoverPullsForRepo(r.id);
      if (res.linked) console.log(`[worker] ${r.owner}/${r.name}: linked ${res.linked} PR(s)`);
      if (res.error) console.warn(`[worker] ${r.owner}/${r.name}: ${res.error}`);
    }
  });

  await boss.work(QUEUE_REAP, { batchSize: 1 }, async () => {
    const r = await reapSessions();
    if (r.silent || r.tooLong) console.log(`[worker] reaper: failed ${r.silent} silent session(s), interrupted ${r.tooLong} over the max duration`);
  });

  console.log("[worker] started; polling PRs every minute, discovering every 2 minutes, reaping sessions every minute");

  const shutdown = async () => {
    console.log("[worker] stopping");
    await boss.stop({ graceful: true, timeout: 10_000 });
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
