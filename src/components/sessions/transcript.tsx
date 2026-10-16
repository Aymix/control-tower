"use client";
import { AlertTriangle, Bot, GitBranch, ShieldBan, Terminal, UserRound, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/common/markdown";
import type { SessionStatus } from "@/db/schema";
import { cn } from "@/lib/utils";
import { fmtTokens, fmtUsd, SessionStatusBadge } from "./status-badge";

export type TranscriptEvent = { seq: number; type: string; payload: Record<string, unknown>; createdAt: string | Date };
export type StatusSnapshot = { status: SessionStatus; costUsd: number; error: string | null; attached: boolean; pullRequestId: string | null; hasUnpushedCommits: boolean; inputTokens: number; outputTokens: number; numTurns: number };

export function Transcript({ sessionId, initialEvents, initialStatus, onStatus }: { sessionId: string; initialEvents: TranscriptEvent[]; initialStatus: StatusSnapshot; onStatus?: (s: StatusSnapshot) => void }) {
  const [events, setEvents] = useState<TranscriptEvent[]>(initialEvents);
  const [status, setStatus] = useState<StatusSnapshot>(initialStatus);
  const [partial, setPartial] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const lastSeq = useRef(initialEvents.at(-1)?.seq ?? 0);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);
  const bottom = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      es = new EventSource(`/api/sessions/${sessionId}/stream?after=${lastSeq.current}`);
      es.onopen = () => setConnected(true);
      es.addEventListener("event", (e) => {
        const ev = JSON.parse((e as MessageEvent).data) as TranscriptEvent;
        if (ev.seq <= lastSeq.current) return;
        lastSeq.current = ev.seq;
        if (ev.type === "partial") {
          setPartial(String(ev.payload.text ?? ""));
          return;
        }
        if (ev.type === "assistant") setPartial("");
        setEvents((prev) => [...prev, ev]);
      });
      es.addEventListener("status", (e) => {
        const s = JSON.parse((e as MessageEvent).data) as StatusSnapshot;
        setStatus(s);
        onStatusRef.current?.(s);
        if (s.status !== "running") setPartial("");
      });
      es.onerror = () => {
        setConnected(false);
        es?.close();
        setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, [sessionId]);

  useEffect(() => {
    if (stickToBottom.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [events, partial]);

  const toolNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) if (e.type === "assistant") for (const b of (e.payload.content as Record<string, unknown>[]) ?? []) if (b.type === "tool_use") m.set(String(b.id), String(b.name));
    return m;
  }, [events]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-3 text-xs text-muted-foreground border-b pb-2 mb-2">
        <SessionStatusBadge status={status.status} />
        <span>{fmtUsd(status.costUsd)} · {fmtTokens(status.inputTokens)} in / {fmtTokens(status.outputTokens)} out · {status.numTurns} turn{status.numTurns === 1 ? "" : "s"}</span>
        <span className={cn("ml-auto inline-flex items-center gap-1", connected ? "text-emerald-600 dark:text-emerald-400" : "")}>
          <span className={cn("size-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-muted-foreground/50")} /> {connected ? "live" : "reconnecting"}
        </span>
      </div>
      <div
        className="flex-1 overflow-y-auto space-y-3 pr-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {events.filter((e) => e.type !== "partial").map((e) => (
          <EventRow key={e.seq} ev={e} toolNames={toolNames} />
        ))}
        {partial ? (
          <div className="flex gap-2">
            <Bot className="size-4 mt-1 text-violet-500 shrink-0" />
            <div className="prose-ct opacity-80 whitespace-pre-wrap">{partial}<span className="animate-pulse">▍</span></div>
          </div>
        ) : null}
        {status.status === "queued" ? <p className="text-sm text-muted-foreground">Waiting for your runner to pick this up…</p> : null}
        {status.error ? <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="size-3.5" /> {status.error}</p> : null}
        <div ref={bottom} />
      </div>
    </div>
  );
}

function EventRow({ ev, toolNames }: { ev: TranscriptEvent; toolNames: Map<string, string> }) {
  const p = ev.payload;
  switch (ev.type) {
    case "init":
      return <Meta icon={<Terminal className="size-3.5" />}>Session started · model {String(p.model)} · auth {String(p.apiKeySource)} · Claude Code {String(p.claudeVersion)}</Meta>;
    case "status":
      return <Meta icon={<Terminal className="size-3.5" />}>{String(p.note ?? "")}</Meta>;
    case "git":
      return <Meta icon={<GitBranch className="size-3.5" />}>{String(p.message ?? "")}</Meta>;
    case "guard":
      return (
        <Meta icon={<ShieldBan className="size-3.5 text-red-500" />} className="text-red-700 dark:text-red-300">
          Blocked {String(p.tool)}: {String(p.reason)} <code className="font-mono text-[11px] opacity-80">{short(JSON.stringify(p.input))}</code>
        </Meta>
      );
    case "error":
      return <Meta icon={<AlertTriangle className="size-3.5 text-red-500" />} className="text-red-700 dark:text-red-300">{String(p.message)}</Meta>;
    case "user_message":
      return (
        <div className="flex gap-2">
          <UserRound className="size-4 mt-1 shrink-0 text-muted-foreground" />
          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm flex-1">
            <div className="text-[11px] text-muted-foreground mb-0.5">{String(p.kind) === "steer" ? "Steering message" : "Follow-up"}</div>
            <Markdown>{String(p.body ?? "")}</Markdown>
          </div>
        </div>
      );
    case "tool_call":
      return null; // the assistant tool_use block already shows the call
    case "tool_result":
      if (p.ok) return null; // the tool_result block already shows the outcome
      return <Meta icon={<Wrench className="size-3.5 text-red-500" />} className="text-red-700 dark:text-red-300">{String(p.name)} failed: {String(p.text ?? "")}</Meta>;
    case "assistant": {
      const blocks = (p.content as Record<string, unknown>[]) ?? [];
      return (
        <div className="flex gap-2">
          <Bot className="size-4 mt-1 text-violet-500 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            {blocks.map((b, i) => {
              if (b.type === "text") return <Markdown key={i}>{String(b.text)}</Markdown>;
              if (b.type === "thinking") return <details key={i} className="text-xs text-muted-foreground"><summary className="cursor-pointer">thinking</summary><pre className="whitespace-pre-wrap">{String(b.text)}</pre></details>;
              if (b.type === "tool_use")
                return (
                  <details key={i} className="rounded border text-xs">
                    <summary className="px-2 py-1 cursor-pointer font-mono flex items-center gap-1"><Wrench className="size-3" /> {String(b.name)} {toolSummary(String(b.name), b.input as Record<string, unknown>)}</summary>
                    <pre className="px-2 py-1 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(b.input, null, 2)}</pre>
                  </details>
                );
              return null;
            })}
          </div>
        </div>
      );
    }
    case "user": {
      const blocks = (p.content as Record<string, unknown>[]) ?? [];
      return (
        <div className="pl-6 space-y-1">
          {blocks.map((b, i) => (
            <details key={i} className={cn("rounded border text-xs", !!b.is_error && "border-red-500/40")}>
              <summary className="px-2 py-1 cursor-pointer font-mono">{toolNames.get(String(b.tool_use_id)) ?? "tool"} result{b.is_error ? " (error)" : ""} · {String(b.text ?? "").length} chars</summary>
              <pre className="px-2 py-1 overflow-x-auto whitespace-pre-wrap max-h-80">{String(b.text ?? "")}</pre>
            </details>
          ))}
        </div>
      );
    }
    case "result":
      return (
        <Meta icon={<Terminal className="size-3.5" />} className={p.isError ? "text-red-700 dark:text-red-300" : ""}>
          Turn finished ({String(p.subtype)}) · {fmtUsd(Number(p.costUsd ?? 0))} total · {Math.round(Number(p.durationMs ?? 0) / 1000)}s
        </Meta>
      );
    default:
      return null;
  }
}

function Meta({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 text-xs text-muted-foreground", className)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function short(s: string, n = 160) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function toolSummary(name: string, input: Record<string, unknown> | undefined) {
  if (!input) return "";
  if (name === "Bash") return short(String(input.command ?? ""), 100);
  if (name.startsWith("mcp__tower__")) return short(String(input.title ?? input.summary ?? input.reason ?? ""), 100);
  if (name === "Read" || name === "Write" || name === "Edit") return short(String(input.file_path ?? ""), 100);
  if (name === "Grep") return short(String(input.pattern ?? ""), 60);
  if (name === "Glob") return short(String(input.pattern ?? ""), 60);
  return "";
}
