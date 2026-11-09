CREATE TABLE "owner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"sms_log_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "owner_note" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewal_token" varchar(80);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewal_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "owner_sessions" ADD CONSTRAINT "owner_sessions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_reminders" ADD CONSTRAINT "subscription_reminders_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_sessions_token" ON "owner_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "owner_sessions_owner" ON "owner_sessions" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_once" ON "subscription_reminders" USING btree ("subscription_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_renewal_token" ON "subscriptions" USING btree ("renewal_token");