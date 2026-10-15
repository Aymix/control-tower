"use client";
import { Cpu, Trash2 } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/common/copy-button";
import { TimeAgo } from "@/components/common/time";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createRunnerToken, revokeRunnerToken } from "@/server/actions/runners";
import { cn } from "@/lib/utils";

export type RunnerRow = {
  id: string;
  name: string;
  last4: string;
  hostname: string | null;
  platform: string | null;
  capacity: number;
  runnerVersion: string | null;
  claudeVersion: string | null;
  online: boolean;
  authLabel: "Claude plan" | "API key" | "Unknown";
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  activeSessions: number;
};

export function RunnerManager({ runners, towerUrl }: { runners: RunnerRow[]; towerUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <ul className="rounded-lg border divide-y">
        {runners.map((r) => (
          <li key={r.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", r.revokedAt && "opacity-60")}>
            <Cpu className="size-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium flex items-center gap-2">
                {r.name}
                <span className={cn("inline-flex items-center gap-1 text-[11px] rounded border px-1.5 py-0.5", r.online ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                  <span className={cn("size-1.5 rounded-full", r.online ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                  {r.revokedAt ? "Revoked" : r.online ? "Online" : "Offline"}
                </span>
                <span className={cn("text-[11px] rounded border px-1.5 py-0.5", r.authLabel === "Claude plan" ? "border-blue-500/30 text-blue-700 dark:text-blue-300" : r.authLabel === "API key" ? "border-amber-500/30 text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                  {r.authLabel}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                ••••{r.last4}
                {r.hostname ? ` · ${r.hostname}` : ""}
                {r.platform ? ` (${r.platform})` : ""} · capacity {r.capacity}
                {r.claudeVersion ? ` · Claude Code ${r.claudeVersion}` : ""}
                {r.lastSeenAt ? <> · seen <TimeAgo date={r.lastSeenAt} /></> : " · never connected"}
                {r.activeSessions ? ` · ${r.activeSessions} active session${r.activeSessions > 1 ? "s" : ""}` : ""}
              </div>
            </div>
            {!r.revokedAt ? (
              <ActionButton size="icon-xs" variant="ghost" action={() => revokeRunnerToken(r.id)} confirm={`Revoke "${r.name}"? The runner process will exit.`} title="Revoke">
                <Trash2 className="size-3.5" />
              </ActionButton>
            ) : null}
          </li>
        ))}
        {runners.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">No runners yet. Create a token and start one on your machine.</li> : null}
      </ul>
      <ActionForm action={createRunnerToken} resetOnSuccess onSuccess={(d) => setToken(d?.token ?? null)} className="flex gap-2 max-w-md">
        <Input name="name" placeholder="Runner name (e.g. MacBook)" />
        <Button type="submit" size="sm">Create runner token</Button>
      </ActionForm>
      {token ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
          <div className="font-medium">Token created. It is shown only once.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs">{token}</code>
            <CopyButton value={token} />
          </div>
          <div className="text-xs text-muted-foreground">Run on your machine (after <code>claude login</code>):</div>
          <pre className="text-xs bg-background border rounded p-2 overflow-x-auto">{`TOWER_URL=${towerUrl} TOWER_RUNNER_TOKEN=${token} pnpm runner`}</pre>
        </div>
      ) : null}
    </div>
  );
}
