CREATE TYPE "public"."session_kind" AS ENUM('planning', 'implementation');--> statement-breakpoint
CREATE TYPE "public"."session_message_kind" AS ENUM('initial', 'steer', 'followup');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('queued', 'claimed', 'starting', 'running', 'idle', 'completed', 'failed', 'interrupted', 'budget_reached');--> statement-breakpoint
CREATE TABLE "agent_session" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"repo_id" text,
	"kind" "session_kind" NOT NULL,
	"status" "session_status" DEFAULT 'queued' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"max_budget_cents" integer,
	"created_by" text NOT NULL,
	"runner_id" text,
	"sdk_session_id" text,
	"branch" text,
	"base_branch" text,
	"worktree_path" text,
	"has_unpushed_commits" boolean DEFAULT false NOT NULL,
	"attached" boolean DEFAULT false NOT NULL,
	"interrupt_requested_at" timestamp with time zone,
	"end_requested_at" timestamp with time zone,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"api_key_source" text,
	"num_turns" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"pull_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last4" text NOT NULL,
	"hostname" text,
	"platform" text,
	"capacity" integer DEFAULT 1 NOT NULL,
	"runner_version" text,
	"claude_version" text,
	"api_key_source" text,
	"has_api_key_env" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runner_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "session_event" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"kind" "session_message_kind" NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"num_turns" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_repo_id_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_runner_id_runner_token_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runner_token"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_token" ADD CONSTRAINT "runner_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_event" ADD CONSTRAINT "session_event_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_entry" ADD CONSTRAINT "usage_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_entry" ADD CONSTRAINT "usage_entry_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_entry" ADD CONSTRAINT "usage_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_session_task_idx" ON "agent_session" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_session_ws_idx" ON "agent_session" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_session_status_idx" ON "agent_session" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runner_token_user_idx" ON "runner_token" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_event_seq_idx" ON "session_event" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "session_message_session_idx" ON "session_message" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_ws_created_idx" ON "usage_entry" USING btree ("workspace_id","created_at");