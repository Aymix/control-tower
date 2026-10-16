CREATE TYPE "public"."source_kind" AS ENUM('url', 'notion', 'confluence', 'google_doc');--> statement-breakpoint
CREATE TABLE "kb_source" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" text,
	"kind" "source_kind" NOT NULL,
	"label" text NOT NULL,
	"ref" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_enc" text,
	"secret_last4" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"sync_interval_minutes" integer DEFAULT 0 NOT NULL,
	"content_hash" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo" ADD COLUMN "claude_md_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repo" ADD COLUMN "claude_md_hash" text;--> statement-breakpoint
ALTER TABLE "repo" ADD COLUMN "claude_md_pr_url" text;--> statement-breakpoint
ALTER TABLE "repo" ADD COLUMN "claude_md_error" text;--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_document_id_kb_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_source_ws_idx" ON "kb_source" USING btree ("workspace_id");