import { sql } from "drizzle-orm";
import { db } from "@/db";

export type JobHealth = { name: string; lastCompletedAt: Date | null; lastFailedAt: Date | null; lastError: string | null; scheduled: boolean };

/** Reads pg-boss's own tables so the UI can show whether the worker is alive. */
export async function workerHealth(): Promise<{ available: boolean; jobs: JobHealth[] }> {
  try {
    const rows = await db.execute<{ name: string; last_completed: Date | null; last_failed: Date | null; last_error: string | null }>(sql`
      select name,
             max(case when state = 'completed' then completed_on end) as last_completed,
             max(case when state = 'failed' then completed_on end) as last_failed,
             (array_agg(output::text order by completed_on desc) filter (where state = 'failed'))[1] as last_error
      from pgboss.job
      where name in ('prs.poll', 'prs.discover', 'sessions.reap', 'sources.sync')
      group by name
    `);
    const sched = await db.execute<{ name: string }>(sql`select name from pgboss.schedule`);
    const scheduled = new Set((sched.rows ?? []).map((r) => r.name));
    const byName = new Map((rows.rows ?? []).map((r) => [r.name, r]));
    const jobs: JobHealth[] = ["prs.poll", "prs.discover", "sessions.reap", "sources.sync"].map((name) => {
      const r = byName.get(name);
      return {
        name,
        lastCompletedAt: r?.last_completed ? new Date(r.last_completed) : null,
        lastFailedAt: r?.last_failed ? new Date(r.last_failed) : null,
        lastError: r?.last_error ?? null,
        scheduled: scheduled.has(name),
      };
    });
    return { available: true, jobs };
  } catch {
    return { available: false, jobs: [] };
  }
}

export function workerIsAlive(jobs: JobHealth[], now = new Date()): boolean {
  const reap = jobs.find((j) => j.name === "sessions.reap");
  return !!reap?.lastCompletedAt && now.getTime() - reap.lastCompletedAt.getTime() < 3 * 60_000;
}
