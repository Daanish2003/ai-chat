CREATE TABLE "shared_link" (
	"token" text PRIMARY KEY,
	"conversation_id" uuid NOT NULL UNIQUE,
	"leaf_message_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_link" ADD CONSTRAINT "shared_link_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shared_link" ADD CONSTRAINT "shared_link_leaf_message_id_message_id_fkey" FOREIGN KEY ("leaf_message_id") REFERENCES "message"("id") ON DELETE CASCADE;