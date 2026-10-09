CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment_blob" (
	"attachment_id" uuid PRIMARY KEY,
	"bytes" bytea NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachment" (
	"message_id" uuid,
	"attachment_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "message_attachment_pkey" PRIMARY KEY("message_id","attachment_id")
);
--> statement-breakpoint
CREATE INDEX "attachment_user_id_created_at_idx" ON "attachment" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "message_attachment_attachment_id_idx" ON "message_attachment" ("attachment_id");--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachment_blob" ADD CONSTRAINT "attachment_blob_attachment_id_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachment"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_message_id_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_attachment_id_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachment"("id");--> statement-breakpoint
-- Images and PDFs are already compressed: keep the bytes out of line without compressing them again.
ALTER TABLE "attachment_blob" ALTER COLUMN "bytes" SET STORAGE EXTERNAL;