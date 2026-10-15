import { createSdkMcpServer, query, tool, type HookCallback, type PreToolUseHookInput, type SDKMessage, type SDKUserMessage, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { checkBash, checkFileWrite, type BashGuardContext } from "@/lib/guards/bash";
import { TowerApi, type Bundle, type Control } from "./api";
import type { RunnerConfig } from "./config";
import { ensureWorktree, hasUncommittedChanges, hasUnpushedCommits, removeWorktree, worktreePath } from "./git";

type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number; numTurns: number };

const PLAN_READONLY_TOOLS = ["Read", "Glob", "Grep", "Bash", "WebFetch", "WebSearch", "TodoWrite", "Task", "mcp__tower__submit_plan", "mcp__tower__report_blocker"];

/** One Claude session running on this runner. */
export class RunnerSession {
  private seq: number;
  private buffer: { seq: number; type: string; payload: Record<string, unknown> }[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private inbox: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private q: ReturnType<typeof query> | null = null;
  private usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, numTurns: 0 };
  private partial = "";
  private partialTimer: NodeJS.Timeout | null = null;
  private wt: string | null = null;
  private branch: string | null = null;
  private sdkSessionId: string | null;
  private endRequested = false;
  private turnOpen = false;
  public done: Promise<void>;
  private resolveDone!: () => void;
  private isDone = false;
  private pendingFollowups = 0;

  constructor(
    private cfg: RunnerConfig,
    private api: TowerApi,
    private bundle: Bundle,
    private log: (m: string) => void,
  ) {
    this.seq = bundle.session.lastSeq;
    this.sdkSessionId = bundle.session.sdkSessionId;
    this.done = new Promise((r) => (this.resolveDone = r));
  }

  get id() {
    return this.bundle.session.id;
  }

  // ---- events -------------------------------------------------------------
  emit(type: string, payload: Record<string, unknown> = {}) {
    this.buffer.push({ seq: ++this.seq, type, payload });
    if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flush(), 300);
  }
  private async flush() {
    this.flushTimer = null;
    if (!this.buffer.length) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.api.events(this.id, batch);
    } catch (err) {
      this.log(`event flush failed: ${(err as Error).message}`);
      this.buffer.unshift(...batch);
      this.flushTimer = setTimeout(() => void this.flush(), 2000);
    }
  }
  private async status(patch: Record<string, unknown>) {
    try {
      await this.api.status(this.id, patch);
    } catch (err) {
      this.log(`status update failed: ${(err as Error).message}`);
    }
  }

  // ---- control from the server -------------------------------------------
  applyControl(c: Control) {
    for (const m of c.messages) {
      this.emit("user_message", { kind: m.kind, body: m.body });
      this.pendingFollowups++;
      this.push(m.body);
    }
    if (c.end && !this.endRequested) {
      this.endRequested = true;
      this.log("end requested");
      void this.endGracefully();
    }
    if (c.interrupt && this.q && this.turnOpen) {
      this.log("interrupt requested");
      void this.q.interrupt().then(() => this.emit("status", { note: "interrupted by user" }));
    }
  }

  private push(text: string) {
    this.inbox.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
    this.clearIdle();
    this.wake?.();
  }

  private async *input(): AsyncGenerator<SDKUserMessage> {
    while (!this.closed) {
      if (this.inbox.length) {
        yield this.inbox.shift()!;
        continue;
      }
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
  }

  private clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
  private armIdle() {
    this.clearIdle();
    this.idleTimer = setTimeout(() => {
      this.log(`idle for ${Math.round(this.cfg.idleMs / 1000)}s; detaching`);
      void this.detach();
    }, this.cfg.idleMs);
  }

  /** Stops the SDK process but keeps the session resumable (status stays idle, attached=false). */
  private async detach() {
    this.closed = true;
    this.wake?.();
    await this.status({ attached: false });
  }
  private async endGracefully() {
    this.closed = true;
    this.wake?.();
    if (this.q && this.turnOpen) await this.q.interrupt().catch(() => {});
  }

  // ---- guards --------------------------------------------------------------
  private guardCtx(): BashGuardContext {
    return { kind: this.bundle.session.kind, worktree: this.wt ?? "/nonexistent", defaultBranch: this.bundle.repo?.defaultBranch ?? "main", sessionBranch: this.branch };
  }
  private preToolUse: HookCallback = async (input) => {
    const pre = input as PreToolUseHookInput;
    const ti = (pre.tool_input ?? {}) as Record<string, unknown>;
    let verdict: { allow: true } | { allow: false; reason: string } = { allow: true };
    if (pre.tool_name === "Bash") verdict = checkBash(String(ti.command ?? ""), this.guardCtx());
    else if (pre.tool_name === "Write" || pre.tool_name === "Edit" || pre.tool_name === "MultiEdit" || pre.tool_name === "NotebookEdit")
      verdict = checkFileWrite((ti.file_path as string | undefined) ?? (ti.notebook_path as string | undefined), this.guardCtx());
    if (!verdict.allow) {
      this.emit("guard", { tool: pre.tool_name, input: ti, reason: verdict.reason });
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: verdict.reason } };
    }
    return {};
  };

  // ---- MCP tools -----------------------------------------------------------
  private mcpServer() {
    const forward = (name: string) => async (args: unknown) => {
      this.emit("tool_call", { name, args: args as Record<string, unknown> });
      const r = await this.api.tool(this.id, name, args);
      this.emit("tool_result", { name, ok: r.ok, text: r.ok ? r.result : r.error });
      return { content: [{ type: "text" as const, text: r.ok ? (r.result ?? "ok") : `Error: ${r.error}` }], isError: !r.ok };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: SdkMcpToolDefinition<any>[] = [
      tool(
        "report_blocker",
        "Mark the task as Blocked with a precise reason and notify the owner. Use when you cannot proceed (missing access, unclear requirements, failing environment).",
        { reason: z.string().describe("One or two sentences: what is blocking"), details: z.string().optional().describe("What you tried; what you need") },
        forward("report_blocker"),
      ),
    ];
    if (this.bundle.session.kind === "planning") {
      tools.push(
        tool(
          "submit_plan",
          "Hand back the plan. Saves it to the knowledge base and creates task proposals for the owner to accept. Call once when the plan is complete.",
          {
            summary: z.string().describe("Short summary of the approach"),
            plan: z.string().describe("Full plan in markdown"),
            proposals: z
              .array(
                z.object({
                  key: z.string().describe("p1, p2…"),
                  title: z.string(),
                  body: z.string().optional().describe("What to do"),
                  acceptanceCriteria: z.string().optional(),
                  dependsOn: z.array(z.string()).optional().describe("Keys of proposals this depends on"),
                }),
              )
              .optional()
              .describe("Smaller tasks the work breaks into"),
          },
          forward("submit_plan"),
        ),
      );
    } else {
      tools.push(
        tool(
          "open_pull_request",
          "Open a pull request for the pushed session branch and move the task to In review. Push your commits first.",
          { title: z.string(), body: z.string().optional().describe("Markdown description: what changed, how to test"), draft: z.boolean().optional() },
          forward("open_pull_request"),
        ),
      );
    }
    return createSdkMcpServer({ name: "tower", version: "1.0.0", tools });
  }

  // ---- main ----------------------------------------------------------------
  async run() {
    const s = this.bundle.session;
    try {
      await this.status({ status: "starting", attached: true });
      this.emit("status", { note: this.bundle.resuming ? "resuming session" : "starting session" });

      if (this.bundle.repo) {
        const r = this.bundle.repo;
        const wt = await ensureWorktree(this.cfg, { sessionId: s.id, owner: r.owner, name: r.name, defaultBranch: r.defaultBranch, branch: s.branch, kind: s.kind }, (m) => {
          this.log(m);
          this.emit("git", { message: m });
        });
        this.wt = wt.path;
        this.branch = wt.branch;
        await this.status({ worktreePath: this.wt, branch: this.branch });
      } else {
        this.wt = worktreePath(this.cfg, s.id);
        await import("node:fs/promises").then((fs) => fs.mkdir(this.wt!, { recursive: true }));
      }

      // Seed the conversation.
      if (!this.bundle.resuming) this.push(this.bundle.pack.firstMessage);
      else if (!this.inbox.length) {
        // Resume with whatever follow-ups the server hands us on the next poll; wait briefly for them.
        await new Promise((r) => setTimeout(r, 1500));
      }

      const allowed = s.kind === "planning" ? PLAN_READONLY_TOOLS : undefined;
      const disallowed = s.kind === "planning" ? ["Write", "Edit", "MultiEdit", "NotebookEdit"] : [];

      this.q = query({
        prompt: this.input(),
        options: {
          cwd: this.wt!,
          model: s.model,
          resume: this.sdkSessionId ?? undefined,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          allowedTools: allowed,
          disallowedTools: disallowed,
          systemPrompt: { type: "preset", preset: "claude_code", append: this.bundle.pack.systemAppend },
          mcpServers: { tower: this.mcpServer() },
          strictMcpConfig: true,
          settingSources: [],
          includePartialMessages: true,
          maxBudgetUsd: s.maxBudgetUsd ?? undefined,
          hooks: { PreToolUse: [{ hooks: [this.preToolUse] }] },
          stderr: (d) => this.log(`[claude] ${d.trimEnd()}`),
          env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
        },
      });

      let announcedRunning = false;
      for await (const msg of this.q) {
        if (this.endRequested && !this.turnOpen) break;
        await this.handle(msg);
        if (!announcedRunning && msg.type === "system" && msg.subtype === "init") {
          announcedRunning = true;
          await this.status({ status: "running", attached: true, apiKeySource: msg.apiKeySource, claudeVersion: msg.claude_code_version, sdkSessionId: msg.session_id });
          this.sdkSessionId = msg.session_id;
          if (!this.cfg.allowApiKey && msg.apiKeySource !== "none" && msg.apiKeySource !== "oauth") {
            throw new Error(`Refusing to run on an API key (apiKeySource=${msg.apiKeySource}). Sessions must use your Claude subscription (claude login). Set TOWER_ALLOW_API_KEY=1 to override.`);
          }
        }
      }
      await this.finish(this.endRequested ? "completed" : "idle");
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.log(`session failed: ${message}`);
      this.emit("error", { message });
      await this.finish("failed", message);
    }
  }

  private async handle(msg: SDKMessage) {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") this.emit("init", { model: msg.model, apiKeySource: msg.apiKeySource, claudeVersion: msg.claude_code_version, tools: msg.tools, cwd: msg.cwd, mcp: msg.mcp_servers });
        else if (msg.subtype === "compact_boundary") this.emit("status", { note: "context compacted" });
        break;
      case "stream_event": {
        const ev = msg.event as { type: string; delta?: { type?: string; text?: string } };
        if (ev.type === "message_start") {
          this.turnOpen = true;
          this.partial = "";
        }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          this.partial += ev.delta.text;
          if (!this.partialTimer) this.partialTimer = setTimeout(() => {
            this.partialTimer = null;
            this.emit("partial", { text: this.partial.slice(-4000) });
          }, 700);
        }
        break;
      }
      case "assistant": {
        if (this.partialTimer) {
          clearTimeout(this.partialTimer);
          this.partialTimer = null;
        }
        this.partial = "";
        const content = (msg.message.content as unknown[]).map(compactBlock);
        this.emit("assistant", { content, uuid: msg.uuid, parentToolUseId: msg.parent_tool_use_id });
        break;
      }
      case "user": {
        if (msg.isSynthetic) break;
        const c = msg.message.content;
        if (typeof c === "string") break; // our own prompt; already echoed
        const results = (c as unknown[]).filter((b) => (b as { type?: string }).type === "tool_result").map(compactBlock);
        if (results.length) this.emit("user", { content: results, parentToolUseId: msg.parent_tool_use_id });
        break;
      }
      case "result": {
        this.turnOpen = false;
        this.pendingFollowups = Math.max(0, this.pendingFollowups - 1);
        const u = msg.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
        this.usage = {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
          costUsd: msg.total_cost_usd ?? 0,
          numTurns: msg.num_turns ?? 0,
        };
        this.emit("result", { subtype: msg.subtype, isError: msg.is_error, durationMs: msg.duration_ms, costUsd: msg.total_cost_usd, numTurns: msg.num_turns, usage: this.usage, text: msg.subtype === "success" ? msg.result.slice(0, 4000) : (msg as { errors?: string[] }).errors?.join("\n") });
        const unpushed = this.wt && this.branch ? await hasUnpushedCommits(this.wt, this.branch) : false;
        if (msg.subtype === "error_max_budget_usd") {
          await this.status({ status: "budget_reached", usage: this.usage, hasUnpushedCommits: unpushed, sdkSessionId: this.sdkSessionId });
          this.closed = true;
          this.wake?.();
        } else if (msg.subtype !== "success") {
          await this.status({ status: "failed", error: (msg as { errors?: string[] }).errors?.join("; ") ?? msg.subtype, usage: this.usage, hasUnpushedCommits: unpushed, sdkSessionId: this.sdkSessionId });
          this.closed = true;
          this.wake?.();
        } else if (this.endRequested) {
          this.closed = true;
          this.wake?.();
        } else {
          const interrupted = msg.stop_reason === "interrupt" || /interrupt/i.test(msg.result ?? "");
          await this.status({ status: interrupted ? "interrupted" : "idle", usage: this.usage, hasUnpushedCommits: unpushed, attached: true, sdkSessionId: this.sdkSessionId });
          if (this.inbox.length === 0) this.armIdle();
        }
        break;
      }
      default:
        break;
    }
  }

  private async finish(status: "idle" | "completed" | "failed", error?: string) {
    if (this.isDone) return;
    this.isDone = true;
    this.clearIdle();
    this.closed = true;
    this.wake?.();
    await this.flush();
    let unpushed = false;
    let dirty = false;
    if (this.wt && this.bundle.repo) {
      unpushed = await hasUnpushedCommits(this.wt, this.branch).catch(() => false);
      dirty = await hasUncommittedChanges(this.wt).catch(() => false);
    }
    const keep = this.cfg.keepWorktrees || unpushed || dirty || status === "idle";
    if (status !== "idle") {
      await this.status({ status, error: error ?? null, attached: false, hasUnpushedCommits: unpushed, usage: this.usage, sdkSessionId: this.sdkSessionId, worktreePath: keep ? this.wt : null });
    } else {
      await this.status({ attached: false, hasUnpushedCommits: unpushed, usage: this.usage, sdkSessionId: this.sdkSessionId });
    }
    if (!keep && this.wt && this.bundle.repo) {
      await removeWorktree(this.cfg, this.bundle.repo.owner, this.bundle.repo.name, this.wt, this.log).catch((e) => this.log(`cleanup failed: ${e.message}`));
      this.emit("git", { message: "worktree removed" });
    } else if (this.wt && (unpushed || dirty)) {
      this.emit("git", { message: `worktree kept at ${this.wt} (${unpushed ? "unpushed commits" : "uncommitted changes"})` });
    }
    await this.flush();
    this.resolveDone();
  }
}

function compactBlock(b: unknown): Record<string, unknown> {
  const block = b as Record<string, unknown>;
  switch (block.type) {
    case "text":
      return { type: "text", text: String(block.text ?? "") };
    case "thinking":
      return { type: "thinking", text: String((block.thinking as string) ?? "").slice(0, 2000) };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: truncateJson(block.input) };
    case "tool_result": {
      const content = block.content;
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (c as { text?: string }).text ?? "").join("\n") : "";
      return { type: "tool_result", tool_use_id: block.tool_use_id, is_error: !!block.is_error, text: text.slice(0, 6000) };
    }
    default:
      return { type: String(block.type ?? "unknown") };
  }
}

function truncateJson(v: unknown): unknown {
  const s = JSON.stringify(v ?? {});
  if (s.length <= 6000) return v;
  return { _truncated: true, preview: s.slice(0, 6000) };
}
