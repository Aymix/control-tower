/**
 * Control Tower runner: runs Claude sessions on this machine, under this
 * machine's own `claude login` (your Claude subscription) and your own git
 * credentials. One runner per person; never share tokens or accounts.
 *
 *   TOWER_URL=https://tower.example.com TOWER_RUNNER_TOKEN=ctr_… pnpm runner
 */
import "dotenv/config";
import { sh } from "./git";
import { loadConfig, RUNNER_VERSION } from "./config";
import { RevokedError, TowerApi } from "./api";
import { RunnerSession } from "./session";

const log = (m: string) => console.log(`[runner ${new Date().toISOString().slice(11, 19)}] ${m}`);

async function main() {
  const cfg = loadConfig();
  if (process.env.ANTHROPIC_API_KEY && !cfg.allowApiKey) {
    console.error("ANTHROPIC_API_KEY is set. Control Tower sessions run on your Claude subscription, not an API key. Unset it, or set TOWER_ALLOW_API_KEY=1 to allow it deliberately.");
    process.exit(2);
  }
  const auth = await sh("claude", ["auth", "status"]);
  let claudeVersion: string | undefined;
  try {
    const v = await sh("claude", ["--version"]);
    claudeVersion = v.stdout.trim().split(/\s+/)[0];
  } catch {}
  if (auth.code === 0) {
    try {
      const j = JSON.parse(auth.stdout) as { loggedIn?: boolean; authMethod?: string };
      if (!j.loggedIn) {
        console.error("Claude Code is not logged in on this machine. Run `claude login` first.");
        process.exit(2);
      }
      log(`claude auth: ${j.authMethod ?? "ok"}${claudeVersion ? `, version ${claudeVersion}` : ""}`);
    } catch {
      log("claude auth status returned non-JSON; continuing");
    }
  } else {
    log("could not run `claude auth status`; the SDK will report its auth source at session start");
  }

  const api = new TowerApi(cfg);
  const hello = await api.hello({ hostname: cfg.hostname, platform: `${process.platform}-${process.arch}`, capacity: cfg.capacity, runnerVersion: RUNNER_VERSION, claudeVersion, hasApiKeyEnv: !!process.env.ANTHROPIC_API_KEY });
  log(`connected to ${cfg.towerUrl} as ${hello.userName} (runner "${hello.runnerName}", capacity ${cfg.capacity}, home ${cfg.home})`);

  const active = new Map<string, RunnerSession>();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    log("stopping; detaching sessions");
    for (const s of active.values()) s.applyControl({ messages: [], interrupt: true, end: false });
    await Promise.race([Promise.all([...active.values()].map((s) => s.done)), new Promise((r) => setTimeout(r, 8000))]);
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());

  for (;;) {
    if (stopping) break;
    try {
      const res = await api.poll([...active.keys()]);
      for (const [id, control] of Object.entries(res.control)) {
        const s = active.get(id);
        if (s) s.applyControl(control);
      }
      for (const id of res.claimed) {
        if (active.has(id)) continue;
        const bundle = await api.bundle(id);
        const s = new RunnerSession(cfg, api, bundle, (m) => log(`[${id.slice(0, 8)}] ${m}`));
        active.set(id, s);
        log(`claimed ${bundle.session.kind} session for T-${bundle.session.taskNumber} (${bundle.session.workspaceSlug})`);
        const control = res.control[id];
        if (control) s.applyControl(control);
        void s.run().finally(() => {
          active.delete(id);
          log(`session ${id.slice(0, 8)} finished`);
        });
      }
    } catch (err) {
      if (err instanceof RevokedError) {
        console.error("Runner token was revoked. Exiting.");
        process.exit(3);
      }
      log(`poll failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, hello.pollIntervalMs || cfg.pollIntervalMs));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
