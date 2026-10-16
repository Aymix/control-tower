import type { RunnerConfig } from "./config";

export class RevokedError extends Error {}

export type Bundle = {
  session: {
    id: string;
    kind: "planning" | "implementation" | "briefing";
    model: string;
    maxBudgetUsd: number | null;
    sdkSessionId: string | null;
    branch: string | null;
    baseBranch: string | null;
    worktreePath: string | null;
    lastSeq: number;
    taskNumber: number;
    taskTitle: string;
    workspaceSlug: string;
  };
  repo: { owner: string; name: string; defaultBranch: string } | null;
  pack: { systemAppend: string; firstMessage: string };
  resuming: boolean;
};

export type Control = { messages: { id: string; kind: "initial" | "steer" | "followup"; body: string }[]; interrupt: boolean; end: boolean };

export class TowerApi {
  constructor(private cfg: RunnerConfig) {}

  private async call<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    const res = await fetch(`${this.cfg.towerUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {}
    if (res.status === 401 && json.revoked) throw new RevokedError(String(json.error ?? "revoked"));
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.error ?? res.statusText}`);
    return json as T;
  }

  hello(info: { hostname: string; platform: string; capacity: number; runnerVersion: string; claudeVersion?: string; hasApiKeyEnv: boolean }) {
    return this.call<{ runnerId: string; runnerName: string; userName: string; pollIntervalMs: number }>("/api/runner/hello", info);
  }
  poll(active: string[]) {
    return this.call<{ claimed: string[]; control: Record<string, Control> }>("/api/runner/poll", { active });
  }
  bundle(sessionId: string) {
    return this.call<Bundle>(`/api/runner/sessions/${sessionId}/bundle`, undefined, "GET");
  }
  events(sessionId: string, events: { seq: number; type: string; payload: Record<string, unknown> }[]) {
    return this.call<{ lastSeq: number }>(`/api/runner/sessions/${sessionId}/events`, { events });
  }
  status(sessionId: string, patch: Record<string, unknown>) {
    return this.call<{ ok: true }>(`/api/runner/sessions/${sessionId}/status`, patch);
  }
  async tool(sessionId: string, name: string, args: unknown): Promise<{ ok: boolean; result?: string; error?: string }> {
    const res = await fetch(`${this.cfg.towerUrl}/api/runner/sessions/${sessionId}/tool`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name, args }),
    });
    try {
      return (await res.json()) as { ok: boolean; result?: string; error?: string };
    } catch {
      return { ok: false, error: `tool call failed (${res.status})` };
    }
  }
}
