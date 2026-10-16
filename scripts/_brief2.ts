import { chromium, expect } from "@playwright/test";
import { Client } from "pg";
const BASE = "http://localhost:3000";
async function main() {
  const c = new Client({ connectionString: "postgres://tower:tower@localhost:5433/tower" }); await c.connect();
  const owner = (await c.query(`select id from "user" where role='owner' limit 1`)).rows[0].id;
  const t4 = (await c.query(`select id from task where number=4 and workspace_id=(select id from workspace where slug='acme')`)).rows[0].id; await c.end();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  ctx.setDefaultNavigationTimeout(120000);
  await ctx.request.post(`${BASE}/api/auth/dev/login`, { data: { userId: owner }, headers: { origin: BASE } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/w/acme/briefings`, { waitUntil: "load" });
  await page.getByRole("button", { name: "New briefing" }).click();
  await page.locator("#b-kind").selectOption("blocker");
  await page.locator("#b-task").selectOption(t4);
  await page.getByRole("button", { name: "Draft it" }).click();
  await page.waitForURL(/\/briefings\/[0-9a-f-]+$/, { timeout: 30000 });
  await expect(page.getByRole("button", { name: "I sent this" })).toBeVisible({ timeout: 240000 });
  console.log("--- DRAFT ---\n" + (await page.locator("textarea").first().inputValue()) + "\n--- END ---");
  await browser.close();
}
main().catch((e) => { console.error(e.message?.split("\n")[0]); process.exit(1); });
