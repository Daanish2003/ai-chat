CREATE TABLE "user_credentials" (
	"user_id" text,
	"service" text,
	"encrypted" text NOT NULL,
	"hint" text NOT NULL,
	"verified" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_credentials_pkey" PRIMARY KEY("user_id","service")
);
--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;