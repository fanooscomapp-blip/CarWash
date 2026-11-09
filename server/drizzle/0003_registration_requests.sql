CREATE TABLE "registration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"request_code" varchar(20) NOT NULL,
	"compound_id" uuid NOT NULL,
	"owner_name" varchar(200) NOT NULL,
	"mobile" varchar(30) NOT NULL,
	"unit_number" varchar(40) NOT NULL,
	"vehicles" jsonb NOT NULL,
	"plan_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"receipt_path" text NOT NULL,
	"receipt_mime" varchar(80),
	"note" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"result_owner_id" uuid,
	"result_subscription_id" uuid,
	"status_token" varchar(80) NOT NULL,
	"ip" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_result_owner_id_owners_id_fk" FOREIGN KEY ("result_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_result_subscription_id_subscriptions_id_fk" FOREIGN KEY ("result_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regreq_company_code" ON "registration_requests" USING btree ("company_id","request_code");--> statement-breakpoint
CREATE UNIQUE INDEX "regreq_status_token" ON "registration_requests" USING btree ("status_token");--> statement-breakpoint
CREATE INDEX "regreq_status" ON "registration_requests" USING btree ("company_id","status");