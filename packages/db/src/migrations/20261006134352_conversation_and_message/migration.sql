-- Trigram indexes on conversation.title and message.search_text (searching history).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "message_error_reason" AS ENUM('invalid_key', 'rate_limited', 'provider_error');--> statement-breakpoint
CREATE TYPE "message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "message_status" AS ENUM('streaming', 'complete', 'stopped', 'error');--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text,
	"model" text NOT NULL,
	"active_leaf_id" uuid,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY,
	"conversation_id" uuid NOT NULL,
	"parent_id" uuid,
	"role" "message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"model" text,
	"status" "message_status" NOT NULL,
	"error" text,
	"error_reason" "message_error_reason",
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_user_id_last_message_at_idx" ON "conversation" ("user_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversation_title_trgm_idx" ON "conversation" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "message_conversation_id_parent_id_idx" ON "message" ("conversation_id","parent_id");--> statement-breakpoint
CREATE INDEX "message_search_text_trgm_idx" ON "message" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_active_leaf_id_message_id_fkey" FOREIGN KEY ("active_leaf_id") REFERENCES "message"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_parent_id_message_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "message"("id") ON DELETE CASCADE;