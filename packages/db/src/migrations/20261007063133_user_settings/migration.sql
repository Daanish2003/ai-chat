CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY,
	"title_model" text
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;