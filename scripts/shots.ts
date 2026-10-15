/**
 * Screenshots every page of Control Tower for visual QA.
 *
 *   pnpm shots                 # against http://localhost:3000 (DEV_LOGIN=1 required)
 *   SHOTS_BASE=... pnpm shots
 *
 * Seeds a demo workspace with tasks, a KB doc and proposals when the DB has
 * none, logs in through the dev-login endpoint and writes PNGs to ./shots.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { kbDocument, kbVersion, proposal, proposalBatch, user, workspace, workspaceMember } from "../src/db/schema";
import { createTaskRecord, addSystemComment } from "../src/server/tasks";
import { db as _db } from "../src/db";
import { comment, taskBlocker } from "../src/db/schema";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const OUT = "shots";

async function ensureData() {
  let owner = await db.query.user.findFirst({ where: eq(user.role, "owner") });
  if (!owner) {
    [owner] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Amine", email: `amine-${randomUUID().slice(0, 6)}@users.tower.invalid`, role: "owner" })
      .returning();
  }
  let dev = await db.query.user.findFirst({ where: eq(user.role, "dev") });
  if (!dev) {
    [dev] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Sara Dev", email: `sara-${randomUUID().slice(0, 6)}@users.tower.invalid`, role: "dev" })
      .returning();
  }
  let ws = await db.query.workspace.findFirst({ where: eq(workspace.slug, "acme") });
  if (!ws) {
    [ws] = await db
      .insert(workspace)
      .values({
        id: randomUUID(),
        slug: "acme",
        name: "Acme platform",
        clientName: "Acme Inc.",
        budgetCents: 150000,
        rules: "## Acme conventions\n\n- TypeScript strict, no `any`\n- Run `pnpm test` before opening a PR\n- Never touch `infra/` without asking",
        createdBy: owner.id,
      })
      .returning();
    await db.insert(workspaceMember).values({ workspaceId: ws.id, userId: dev.id }).onConflictDoNothing();

    const t1 = await createTaskRecord({ workspaceId: ws.id, title: "Redesign checkout flow", description: "Replace the 3-step checkout with a single page.\n\n## Acceptance criteria\n\n- Totals update live\n- Works on mobile", priority: "high", assigneeId: dev.id, createdBy: owner.id });
    const t2 = await createTaskRecord({ workspaceId: ws.id, title: "Add cart summary component", parentId: t1.id, assigneeId: dev.id, createdBy: owner.id });
    const t3 = await createTaskRecord({ workspaceId: ws.id, title: "Wire coupon API", parentId: t1.id, createdBy: owner.id });
    const t4 = await createTaskRecord({ workspaceId: ws.id, title: "Rotate staging DB credentials", priority: "urgent", createdBy: owner.id });
    const t5 = await createTaskRecord({ workspaceId: ws.id, title: "Upgrade to Next 16", description: "Follow the codemod, then fix type errors.", priority: "medium", assigneeId: dev.id, createdBy: owner.id });
    const t6 = await createTaskRecord({ workspaceId: ws.id, title: "Fix flaky e2e test on CI", priority: "low", createdBy: owner.id });
    const { task } = await import("../src/db/schema");
    await db.update(task).set({ status: "in_progress" }).where(eq(task.id, t2.id));
    await db.update(task).set({ status: "done", doneAt: new Date() }).where(eq(task.id, t6.id));
    await db.update(task).set({ status: "in_review" }).where(eq(task.id, t5.id));
    await db.update(task).set({ status: "blocked", blockedReason: "Waiting on the client to share the coupon provider sandbox keys." }).where(eq(task.id, t3.id));
    await db.insert(taskBlocker).values({ taskId: t3.id, blockedById: t4.id });
    await addSystemComment(t5.id, `**Sara Dev** moved this task from **In progress** to **In review**.`);
    await _db.insert(comment).values({ id: randomUUID(), taskId: t1.id, kind: "user", authorId: owner.id, body: "Let's keep the existing payment provider for now; **no Stripe migration** in this task." });
    await _db.insert(comment).values({ id: randomUUID(), taskId: t1.id, kind: "agent", body: "Planning session summary: the checkout lives in `apps/web/src/checkout`. I propose 3 subtasks (see Proposals)." });

    const docId = randomUUID();
    await db.insert(kbDocument).values({ id: docId, workspaceId: ws.id, kind: "architecture", title: "Architecture overview", pinned: true, createdBy: owner.id, currentVersion: 2 });
    await db.insert(kbVersion).values([
      { id: randomUUID(), documentId: docId, version: 1, content: "# Architecture\n\nMonorepo with pnpm workspaces.", createdBy: owner.id },
      { id: randomUUID(), documentId: docId, version: 2, content: "# Architecture\n\nMonorepo with pnpm workspaces.\n\n## Apps\n\n- `apps/web` — Next.js storefront\n- `apps/api` — Fastify\n\n## Data\n\nPostgres 16, Drizzle, Redis for sessions.", note: "Added apps and data sections", createdBy: owner.id },
    ]);
    const batchId = randomUUID();
    await db.insert(proposalBatch).values({ id: batchId, workspaceId: ws.id, source: "planning", sourceTaskId: t1.id, title: "Checkout redesign plan", summary: "Three pieces of work fall out of the planning session.", createdBy: owner.id });
    await db.insert(proposal).values([
      { id: randomUUID(), batchId, workspaceId: ws.id, key: "p1", title: "Extract address form into a shared component", body: "Both shipping and billing use the same fields.", acceptanceCriteria: "- One component, two usages\n- Existing tests pass", dependsOn: [], position: 0 },
      { id: randomUUID(), batchId, workspaceId: ws.id, key: "p2", title: "Add optimistic totals", body: "Compute totals client-side while the API call is in flight.", acceptanceCriteria: "- No layout shift\n- Falls back to server totals", dependsOn: ["p1"], position: 1 },
      { id: randomUUID(), batchId, workspaceId: ws.id, key: "p3", title: "Remove the legacy /checkout/step-* routes", body: "After the new page ships.", acceptanceCriteria: "- 301 redirects in place", dependsOn: ["p2"], position: 2 },
    ]);
  }
  const { kbDocument: kbd } = await import("../src/db/schema");
  const doc = await db.query.kbDocument.findFirst({ where: eq(kbd.workspaceId, ws.id) });
  return { owner, dev, ws, docId: doc?.id ?? null };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { owner, dev, ws, docId } = await ensureData();
  const browser = await chromium.launch();
  const shoot = async (userId: string, label: string, pages: [string, string][], dark = false) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: dark ? "dark" : "light" });
    const res = await ctx.request.post(`${BASE}/api/auth/dev/login`, { data: { userId }, headers: { origin: BASE } });
    if (!res.ok()) throw new Error(`dev login failed (${res.status()}): is DEV_LOGIN=1?`);
    const page = await ctx.newPage();
    if (dark) await page.addInitScript(() => localStorage.setItem("ct-theme", "dark"));
    for (const [name, path] of pages) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const file = `${OUT}/${label}-${name}${dark ? "-dark" : ""}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log("✓", file);
    }
    await ctx.close();
  };
  const w = `/w/${ws.slug}`;
  const ownerPages: [string, string][] = [
    ["inbox", "/inbox"],
    ["account", "/account"],
    ["settings", "/settings"],
    ["audit", "/settings/audit"],
    ["overview", w],
    ["board", `${w}/board`],
    ["task", `${w}/tasks/1`],
    ["proposals", `${w}/proposals`],
    ["knowledge", `${w}/knowledge`],
    ...(docId ? ([["knowledge-doc", `${w}/knowledge/${docId}`]] as [string, string][]) : []),
    ["rules", `${w}/rules`],
    ["repos", `${w}/repos`],
    ["prs", `${w}/prs`],
    ["sessions", `${w}/sessions`],
    ["briefings", `${w}/briefings`],
    ["usage", `${w}/usage`],
    ["ws-settings", `${w}/settings`],
  ];
  await shoot(owner.id, "owner", ownerPages);
  await shoot(owner.id, "owner", [["board", `${w}/board`], ["task", `${w}/tasks/1`]], true);
  await shoot(dev.id, "dev", [["inbox", "/inbox"], ["board", `${w}/board`], ["task", `${w}/tasks/3`]]);

  // Public pages
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/public-login.png`, fullPage: true });
  console.log("✓", `${OUT}/public-login.png`);
  await ctx.close();
  await browser.close();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
