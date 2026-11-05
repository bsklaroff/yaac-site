CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" text NOT NULL,
	"digest" text NOT NULL UNIQUE,
	"message" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from" jsonb,
	"server" jsonb NOT NULL,
	"client" jsonb
);
--> statement-breakpoint
CREATE TABLE "feedback_images" (
	"feedback_id" uuid,
	"position" integer,
	"mime_type" text NOT NULL,
	"data" bytea NOT NULL,
	CONSTRAINT "feedback_images_pkey" PRIMARY KEY("feedback_id","position")
);
--> statement-breakpoint
CREATE TABLE "install_keys" (
	"key" text PRIMARY KEY,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "feedback_key_received_at_index" ON "feedback" ("key","received_at");--> statement-breakpoint
CREATE INDEX "install_keys_first_seen_at_index" ON "install_keys" ("first_seen_at");--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_key_install_keys_key_fkey" FOREIGN KEY ("key") REFERENCES "install_keys"("key");--> statement-breakpoint
ALTER TABLE "feedback_images" ADD CONSTRAINT "feedback_images_feedback_id_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "feedback"("id") ON DELETE CASCADE;