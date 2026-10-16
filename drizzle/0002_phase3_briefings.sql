CREATE TYPE "public"."briefing_kind" AS ENUM('status_update', 'pre_task_questions', 'blocker', 'release_notes');--> statement-breakpoint
CREATE TYPE "public"."briefing_status" AS ENUM('queued', 'drafting', 'draft', 'sent', 'discarded', 'failed');--> statement-breakpoint
ALTER TYPE "public"."session_kind" ADD VALUE 'briefing';--> statement-breakpoint
CREATE TABLE "briefing" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text,
	"session_id" text,
	"kind" "briefing_kind" NOT NULL,
	"status" "briefing_status" DEFAULT 'queued' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"draft" text,
	"final_text" text,
	"sent_at" timestamp with time zone,
	"sent_via" text,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefing_edit" (
	"id" text PRIMARY KEY NOT NULL,
	"briefing_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" "briefing_kind" NOT NULL,
	"draft" text NOT NULL,
	"final_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_edit" ADD CONSTRAINT "briefing_edit_briefing_id_briefing_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."briefing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefing_edit" ADD CONSTRAINT "briefing_edit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefing_ws_idx" ON "briefing" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "briefing_status_idx" ON "briefing" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "briefing_edit_ws_kind_idx" ON "briefing_edit" USING btree ("workspace_id","kind","created_at");