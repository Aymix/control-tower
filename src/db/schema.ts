import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth core tables (+ passkey plugin). Column names follow the
// Better Auth defaults so the drizzle adapter maps them 1:1.
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["owner", "dev"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("dev"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    aaguid: text("aaguid"),
  },
  (t) => [index("passkey_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Onboarding: invites and recovery links (shared off-channel by the owner)
// ---------------------------------------------------------------------------

export const invite = pgTable("invite", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  role: userRole("role").notNull().default("dev"),
  label: text("label"),
  workspaceIds: jsonb("workspace_ids").$type<string[]>().notNull().default([]),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recoveryLink = pgTable("recovery_link", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Org-level settings (singleton row id = "org")
// ---------------------------------------------------------------------------

export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey().default("org"),
  name: text("name").notNull().default("Control Tower"),
  globalRules: text("global_rules").notNull().default(""),
  guardrails: text("guardrails").notNull().default(""),
  styleGuide: text("style_guide").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

// ---------------------------------------------------------------------------
// Workspaces (one per client)
// ---------------------------------------------------------------------------

export const workspace = pgTable("workspace", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  budgetCents: integer("budget_cents"),
  defaultModel: text("default_model").notNull().default("claude-sonnet-5-5"),
  rules: text("rules").notNull().default(""),
  githubPatEnc: text("github_pat_enc"),
  githubPatLast4: text("github_pat_last4"),
  githubPollError: text("github_poll_error"),
  githubPollErrorAt: timestamp("github_poll_error_at", { withTimezone: true }),
  taskCounter: integer("task_counter").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const repo = pgTable(
  "repo",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    pushAccess: boolean("push_access"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    checkError: text("check_error"),
    claudeMdSyncedAt: timestamp("claude_md_synced_at", { withTimezone: true }),
    claudeMdHash: text("claude_md_hash"),
    claudeMdPrUrl: text("claude_md_pr_url"),
    claudeMdError: text("claude_md_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("repo_ws_owner_name_idx").on(t.workspaceId, t.owner, t.name)],
);

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export const kbKind = pgEnum("kb_kind", [
  "scope",
  "architecture",
  "decisions",
  "meeting_notes",
  "plan",
  "source_snapshot",
]);

export const kbDocument = pgTable(
  "kb_document",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: kbKind("kind").notNull(),
    title: text("title").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    currentVersion: integer("current_version").notNull().default(1),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kb_doc_ws_idx").on(t.workspaceId)],
);

export const kbVersion = pgTable(
  "kb_version",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => kbDocument.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    note: text("note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kb_version_doc_ver_idx").on(t.documentId, t.version)],
);

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const taskStatus = pgEnum("task_status", [
  "backlog",
  "in_progress",
  "blocked",
  "in_review",
  "done",
]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);

export const task = pgTable(
  "task",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("backlog"),
    blockedReason: text("blocked_reason"),
    priority: taskPriority("priority").notNull().default("medium"),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    parentId: text("parent_id"),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("task_ws_number_idx").on(t.workspaceId, t.number),
    index("task_ws_status_idx").on(t.workspaceId, t.status),
    index("task_parent_idx").on(t.parentId),
  ],
);

export const taskBlocker = pgTable(
  "task_blocker",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    blockedById: text("blocked_by_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.blockedById] })],
);

export const commentKind = pgEnum("comment_kind", ["user", "system", "agent"]);

export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    kind: commentKind("kind").notNull().default("user"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comment_task_idx").on(t.taskId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

export const prState = pgEnum("pr_state", ["open", "closed", "merged"]);
export const ciStatus = pgEnum("ci_status", ["none", "pending", "success", "failure"]);
export const pollPriority = pgEnum("poll_priority", ["hot", "warm", "cold"]);

export const pullRequest = pgTable(
  "pull_request",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    repoId: text("repo_id")
      .notNull()
      .references(() => repo.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => task.id, { onDelete: "set null" }),
    number: integer("number").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull().default(""),
    branch: text("branch").notNull().default(""),
    baseBranch: text("base_branch").notNull().default(""),
    author: text("author"),
    state: prState("state").notNull().default("open"),
    draft: boolean("draft").notNull().default(false),
    ciStatus: ciStatus("ci_status").notNull().default("none"),
    mergeable: boolean("mergeable"),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    changedFiles: integer("changed_files").notNull().default(0),
    headSha: text("head_sha"),
    pollPriority: pollPriority("poll_priority").notNull().default("hot"),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    pollError: text("poll_error"),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ghUpdatedAt: timestamp("gh_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pr_repo_number_idx").on(t.repoId, t.number),
    index("pr_task_idx").on(t.taskId),
    index("pr_ws_state_idx").on(t.workspaceId, t.state),
  ],
);

// ---------------------------------------------------------------------------
// Work detection: proposals
// ---------------------------------------------------------------------------

export const proposalSource = pgEnum("proposal_source", ["planning", "breakdown", "manual"]);
export const proposalStatus = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "merged",
  "discarded",
]);

export const proposalBatch = pgTable(
  "proposal_batch",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    source: proposalSource("source").notNull().default("manual"),
    sourceTaskId: text("source_task_id").references(() => task.id, { onDelete: "set null" }),
    sourceSessionId: text("source_session_id"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposal_batch_ws_idx").on(t.workspaceId)],
);

export const proposal = pgTable(
  "proposal",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => proposalBatch.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // stable key within a batch, used for dependencies (e.g. "p1")
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    acceptanceCriteria: text("acceptance_criteria").notNull().default(""),
    dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
    status: proposalStatus("status").notNull().default("pending"),
    resultingTaskId: text("resulting_task_id").references(() => task.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("proposal_batch_idx").on(t.batchId),
    index("proposal_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id").references(() => workspace.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Relations (for db.query.*)
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  passkeys: many(passkey),
  memberships: many(workspaceMember),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, { fields: [passkey.userId], references: [user.id] }),
}));

export const workspaceRelations = relations(workspace, ({ many }) => ({
  members: many(workspaceMember),
  repos: many(repo),
  tasks: many(task),
  documents: many(kbDocument),
  pullRequests: many(pullRequest),
}));

export const workspaceMemberRelations = relations(workspaceMember, ({ one }) => ({
  workspace: one(workspace, { fields: [workspaceMember.workspaceId], references: [workspace.id] }),
  user: one(user, { fields: [workspaceMember.userId], references: [user.id] }),
}));

export const repoRelations = relations(repo, ({ one, many }) => ({
  workspace: one(workspace, { fields: [repo.workspaceId], references: [workspace.id] }),
  pullRequests: many(pullRequest),
}));

export const taskRelations = relations(task, ({ one, many }) => ({
  sessions: many(agentSession),
  workspace: one(workspace, { fields: [task.workspaceId], references: [workspace.id] }),
  assignee: one(user, { fields: [task.assigneeId], references: [user.id] }),
  parent: one(task, { fields: [task.parentId], references: [task.id], relationName: "subtasks" }),
  subtasks: many(task, { relationName: "subtasks" }),
  comments: many(comment),
  pullRequests: many(pullRequest),
  blockers: many(taskBlocker, { relationName: "blockers" }),
}));

export const taskBlockerRelations = relations(taskBlocker, ({ one }) => ({
  task: one(task, { fields: [taskBlocker.taskId], references: [task.id], relationName: "blockers" }),
  blockedBy: one(task, { fields: [taskBlocker.blockedById], references: [task.id], relationName: "blocking" }),
}));

export const commentRelations = relations(comment, ({ one }) => ({
  task: one(task, { fields: [comment.taskId], references: [task.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}));

export const pullRequestRelations = relations(pullRequest, ({ one }) => ({
  repo: one(repo, { fields: [pullRequest.repoId], references: [repo.id] }),
  task: one(task, { fields: [pullRequest.taskId], references: [task.id] }),
  workspace: one(workspace, { fields: [pullRequest.workspaceId], references: [workspace.id] }),
}));

export const kbDocumentRelations = relations(kbDocument, ({ one, many }) => ({
  workspace: one(workspace, { fields: [kbDocument.workspaceId], references: [workspace.id] }),
  versions: many(kbVersion),
}));

export const kbVersionRelations = relations(kbVersion, ({ one }) => ({
  document: one(kbDocument, { fields: [kbVersion.documentId], references: [kbDocument.id] }),
}));

export const proposalBatchRelations = relations(proposalBatch, ({ one, many }) => ({
  workspace: one(workspace, { fields: [proposalBatch.workspaceId], references: [workspace.id] }),
  sourceTask: one(task, { fields: [proposalBatch.sourceTaskId], references: [task.id] }),
  proposals: many(proposal),
}));

export const proposalRelations = relations(proposal, ({ one }) => ({
  batch: one(proposalBatch, { fields: [proposal.batchId], references: [proposalBatch.id] }),
  resultingTask: one(task, { fields: [proposal.resultingTaskId], references: [task.id] }),
}));

// Convenience types
export type User = typeof user.$inferSelect;
export type Workspace = typeof workspace.$inferSelect;
export type Repo = typeof repo.$inferSelect;
export type Task = typeof task.$inferSelect;
export type Comment = typeof comment.$inferSelect;
export type PullRequest = typeof pullRequest.$inferSelect;
export type KbDocument = typeof kbDocument.$inferSelect;
export type KbVersion = typeof kbVersion.$inferSelect;
export type Proposal = typeof proposal.$inferSelect;
export type ProposalBatch = typeof proposalBatch.$inferSelect;
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type TaskPriority = (typeof taskPriority.enumValues)[number];
export type KbKind = (typeof kbKind.enumValues)[number];

export const TASK_STATUSES = taskStatus.enumValues;
export const TASK_PRIORITIES = taskPriority.enumValues;
export const KB_KINDS = kbKind.enumValues;
export const sqlNow = sql`now()`;

// ---------------------------------------------------------------------------
// Phase 2: runners, Claude sessions, usage
// ---------------------------------------------------------------------------

export const runnerToken = pgTable(
  "runner_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    last4: text("last4").notNull(),
    hostname: text("hostname"),
    platform: text("platform"),
    capacity: integer("capacity").notNull().default(1),
    runnerVersion: text("runner_version"),
    claudeVersion: text("claude_version"),
    apiKeySource: text("api_key_source"), // last observed in a session init: 'none' | 'oauth' | 'ANTHROPIC_API_KEY' | …
    hasApiKeyEnv: boolean("has_api_key_env").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("runner_token_user_idx").on(t.userId)],
);

export const sessionKind = pgEnum("session_kind", ["planning", "implementation", "briefing"]);
export const sessionStatus = pgEnum("session_status", [
  "queued",
  "claimed",
  "starting",
  "running",
  "idle",
  "completed",
  "failed",
  "interrupted",
  "budget_reached",
]);

export const agentSession = pgTable(
  "agent_session",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    repoId: text("repo_id").references(() => repo.id, { onDelete: "set null" }),
    kind: sessionKind("kind").notNull(),
    status: sessionStatus("status").notNull().default("queued"),
    title: text("title").notNull().default(""),
    model: text("model").notNull(),
    maxBudgetUsd: integer("max_budget_cents"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runnerId: text("runner_id").references(() => runnerToken.id, { onDelete: "set null" }),
    sdkSessionId: text("sdk_session_id"),
    branch: text("branch"),
    baseBranch: text("base_branch"),
    worktreePath: text("worktree_path"),
    hasUnpushedCommits: boolean("has_unpushed_commits").notNull().default(false),
    attached: boolean("attached").notNull().default(false), // runner currently holds the SDK process
    interruptRequestedAt: timestamp("interrupt_requested_at", { withTimezone: true }),
    endRequestedAt: timestamp("end_requested_at", { withTimezone: true }),
    lastSeq: integer("last_seq").notNull().default(0),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    apiKeySource: text("api_key_source"),
    numTurns: integer("num_turns").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0), // USD * 1e6, estimated
    pullRequestId: text("pull_request_id").references(() => pullRequest.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("agent_session_task_idx").on(t.taskId),
    index("agent_session_ws_idx").on(t.workspaceId, t.createdAt),
    index("agent_session_status_idx").on(t.status),
  ],
);

export const sessionEvent = pgTable(
  "session_event",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSession.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("session_event_seq_idx").on(t.sessionId, t.seq)],
);

export const sessionMessageKind = pgEnum("session_message_kind", ["initial", "steer", "followup"]);

export const sessionMessage = pgTable(
  "session_message",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSession.id, { onDelete: "cascade" }),
    kind: sessionMessageKind("kind").notNull(),
    body: text("body").notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_message_session_idx").on(t.sessionId, t.createdAt)],
);

export const usageEntry = pgTable(
  "usage_entry",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => agentSession.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
    numTurns: integer("num_turns").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

export const runnerTokenRelations = relations(runnerToken, ({ one, many }) => ({
  user: one(user, { fields: [runnerToken.userId], references: [user.id] }),
  sessions: many(agentSession),
}));

export const agentSessionRelations = relations(agentSession, ({ one, many }) => ({
  workspace: one(workspace, { fields: [agentSession.workspaceId], references: [workspace.id] }),
  task: one(task, { fields: [agentSession.taskId], references: [task.id] }),
  repo: one(repo, { fields: [agentSession.repoId], references: [repo.id] }),
  runner: one(runnerToken, { fields: [agentSession.runnerId], references: [runnerToken.id] }),
  creator: one(user, { fields: [agentSession.createdBy], references: [user.id] }),
  pullRequest: one(pullRequest, { fields: [agentSession.pullRequestId], references: [pullRequest.id] }),
  events: many(sessionEvent),
  messages: many(sessionMessage),
}));

export const sessionEventRelations = relations(sessionEvent, ({ one }) => ({
  session: one(agentSession, { fields: [sessionEvent.sessionId], references: [agentSession.id] }),
}));

export const sessionMessageRelations = relations(sessionMessage, ({ one }) => ({
  session: one(agentSession, { fields: [sessionMessage.sessionId], references: [agentSession.id] }),
}));

export type RunnerToken = typeof runnerToken.$inferSelect;
export type AgentSession = typeof agentSession.$inferSelect;
export type SessionEvent = typeof sessionEvent.$inferSelect;
export type SessionMessage = typeof sessionMessage.$inferSelect;
export type SessionStatus = (typeof sessionStatus.enumValues)[number];
export type SessionKind = (typeof sessionKind.enumValues)[number];
export const SESSION_STATUSES = sessionStatus.enumValues;


// ---------------------------------------------------------------------------
// Phase 3: briefings (client communication drafted in the owner's voice)
// ---------------------------------------------------------------------------

export const briefingKind = pgEnum("briefing_kind", ["status_update", "pre_task_questions", "blocker", "release_notes"]);
export const briefingStatus = pgEnum("briefing_status", ["queued", "drafting", "draft", "sent", "discarded", "failed"]);

export const briefing = pgTable(
  "briefing",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => task.id, { onDelete: "set null" }),
    sessionId: text("session_id").references(() => agentSession.id, { onDelete: "set null" }),
    kind: briefingKind("kind").notNull(),
    status: briefingStatus("status").notNull().default("queued"),
    title: text("title").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    draft: text("draft"),
    finalText: text("final_text"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentVia: text("sent_via"),
    error: text("error"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("briefing_ws_idx").on(t.workspaceId, t.createdAt), index("briefing_status_idx").on(t.workspaceId, t.status)],
);

/** Draft → final pairs, kept so future drafts learn how the owner edits. */
export const briefingEdit = pgTable(
  "briefing_edit",
  {
    id: text("id").primaryKey(),
    briefingId: text("briefing_id")
      .notNull()
      .references(() => briefing.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: briefingKind("kind").notNull(),
    draft: text("draft").notNull(),
    finalText: text("final_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("briefing_edit_ws_kind_idx").on(t.workspaceId, t.kind, t.createdAt)],
);

export const briefingRelations = relations(briefing, ({ one }) => ({
  workspace: one(workspace, { fields: [briefing.workspaceId], references: [workspace.id] }),
  task: one(task, { fields: [briefing.taskId], references: [task.id] }),
  session: one(agentSession, { fields: [briefing.sessionId], references: [agentSession.id] }),
  creator: one(user, { fields: [briefing.createdBy], references: [user.id] }),
}));

export type Briefing = typeof briefing.$inferSelect;
export type BriefingKind = (typeof briefingKind.enumValues)[number];
export type BriefingStatus = (typeof briefingStatus.enumValues)[number];
export const BRIEFING_KINDS = briefingKind.enumValues;

// ---------------------------------------------------------------------------
// Phase 4: external sources snapshotted into the KB, CLAUDE.md sync
// ---------------------------------------------------------------------------

export const sourceKind = pgEnum("source_kind", ["url", "notion", "confluence", "google_doc"]);

export const kbSource = pgTable(
  "kb_source",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    documentId: text("document_id").references(() => kbDocument.id, { onDelete: "set null" }),
    kind: sourceKind("kind").notNull(),
    label: text("label").notNull(),
    ref: text("ref").notNull(), // URL, Notion page URL/id, Confluence page URL/id, Google Doc URL/id
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}), // e.g. confluence base + email
    secretEnc: text("secret_enc"), // integration/API token, AES-256-GCM under MASTER_KEY
    secretLast4: text("secret_last4"),
    pinned: boolean("pinned").notNull().default(false),
    syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(0), // 0 = manual only
    contentHash: text("content_hash"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kb_source_ws_idx").on(t.workspaceId)],
);

export const kbSourceRelations = relations(kbSource, ({ one }) => ({
  workspace: one(workspace, { fields: [kbSource.workspaceId], references: [workspace.id] }),
  document: one(kbDocument, { fields: [kbSource.documentId], references: [kbDocument.id] }),
}));

export type KbSource = typeof kbSource.$inferSelect;
export type SourceKind = (typeof sourceKind.enumValues)[number];
export const SOURCE_KINDS = sourceKind.enumValues;
