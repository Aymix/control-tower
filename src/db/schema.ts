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
