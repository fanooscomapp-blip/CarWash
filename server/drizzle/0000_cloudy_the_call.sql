CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"actor_type" varchar(20) DEFAULT 'user' NOT NULL,
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"currency" varchar(10) DEFAULT 'EGP' NOT NULL,
	"timezone" varchar(60) DEFAULT 'Africa/Cairo' NOT NULL,
	"language" varchar(5) DEFAULT 'en' NOT NULL,
	"date_format" varchar(20) DEFAULT 'DD/MM/YYYY' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"code" varchar(40) NOT NULL,
	"address" text,
	"contact_person" varchar(150),
	"contact_mobile" varchar(30),
	"units_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"target_user_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"mobile" varchar(30) NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"mobile" varchar(30) NOT NULL,
	"alt_mobile" varchar(30),
	"email" varchar(200),
	"notes" text,
	"portal_token" varchar(80),
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"original_name" varchar(255),
	"mime_type" varchar(80),
	"size_bytes" integer,
	"uploaded_by_type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"payment_code" varchar(20) NOT NULL,
	"subscription_id" uuid NOT NULL,
	"renewal_id" uuid,
	"owner_id" uuid NOT NULL,
	"compound_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" varchar(30) NOT NULL,
	"payment_date" date,
	"status" varchar(30) DEFAULT 'pending_verification' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"compound_id" uuid,
	"vehicle_type" varchar(30),
	"price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"token" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"company_id" uuid NOT NULL,
	"key" varchar(20) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sequences_company_id_key_pk" PRIMARY KEY("company_id","key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"company_id" uuid NOT NULL,
	"key" varchar(80) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_company_id_key_pk" PRIMARY KEY("company_id","key")
);
--> statement-breakpoint
CREATE TABLE "sms_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"to_mobile" varchar(30) NOT NULL,
	"owner_id" uuid,
	"template_key" varchar(60),
	"body" text NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"provider_response" jsonb,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" varchar(60) NOT NULL,
	"lang" varchar(5) NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_compounds" (
	"user_id" uuid NOT NULL,
	"compound_id" uuid NOT NULL,
	CONSTRAINT "staff_compounds_user_id_compound_id_pk" PRIMARY KEY("user_id","compound_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"name_ar" varchar(150),
	"plan_type" varchar(20) NOT NULL,
	"duration_days" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"allowed_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"max_frequency_per_week" integer DEFAULT 7 NOT NULL,
	"max_washes" integer NOT NULL,
	"scope" varchar(20) DEFAULT 'per_vehicle' NOT NULL,
	"max_vehicles" integer DEFAULT 1 NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_renewals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"renewal_code" varchar(20) NOT NULL,
	"previous_subscription_id" uuid NOT NULL,
	"new_subscription_id" uuid,
	"requested_by" varchar(20) NOT NULL,
	"requested_by_user_id" uuid,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_vehicles" (
	"subscription_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	CONSTRAINT "subscription_vehicles_subscription_id_vehicle_id_pk" PRIMARY KEY("subscription_id","vehicle_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_code" varchar(20) NOT NULL,
	"compound_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_snapshot" jsonb NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"duration_days" integer NOT NULL,
	"washes_allowed" integer NOT NULL,
	"washes_used" integer DEFAULT 0 NOT NULL,
	"allowed_days" jsonb NOT NULL,
	"frequency_per_week" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"final_amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(30) DEFAULT 'bank_transfer' NOT NULL,
	"payment_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"status" varchar(30) DEFAULT 'pending_payment' NOT NULL,
	"status_reason" text,
	"notes" text,
	"renewed_from_id" uuid,
	"created_by" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"compound_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"unit_number" varchar(40) NOT NULL,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(200) NOT NULL,
	"mobile" varchar(30),
	"password_hash" text NOT NULL,
	"user_type" varchar(20) DEFAULT 'admin' NOT NULL,
	"employee_code" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"date_joined" date,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_code" varchar(20) NOT NULL,
	"plate_number" varchar(40) NOT NULL,
	"compound_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"brand" varchar(80),
	"model" varchar(80),
	"color" varchar(40),
	"vehicle_type" varchar(30) DEFAULT 'sedan' NOT NULL,
	"registration_date" date DEFAULT now(),
	"photo_path" text,
	"notes" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wash_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"phase" varchar(10) NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" varchar(80),
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_original" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "washing_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"start_lat" double precision,
	"start_lng" double precision,
	"end_lat" double precision,
	"end_lng" double precision,
	"notes" text,
	"issue_reported" boolean DEFAULT false NOT NULL,
	"issue_description" text,
	"status" varchar(30) DEFAULT 'in_progress' NOT NULL,
	"quota_consumed" boolean DEFAULT false NOT NULL,
	"admin_reviewed_by" uuid,
	"admin_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "washing_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"generated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "washing_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"task_code" varchar(20) NOT NULL,
	"compound_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"assigned_to" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'assigned' NOT NULL,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compounds" ADD CONSTRAINT "compounds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_renewal_id_subscription_renewals_id_fk" FOREIGN KEY ("renewal_id") REFERENCES "public"."subscription_renewals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_compounds" ADD CONSTRAINT "staff_compounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_compounds" ADD CONSTRAINT "staff_compounds_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_previous_subscription_id_subscriptions_id_fk" FOREIGN KEY ("previous_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_new_subscription_id_subscriptions_id_fk" FOREIGN KEY ("new_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_vehicles" ADD CONSTRAINT "subscription_vehicles_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_vehicles" ADD CONSTRAINT "subscription_vehicles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash_photos" ADD CONSTRAINT "wash_photos_operation_id_washing_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."washing_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_operations" ADD CONSTRAINT "washing_operations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_operations" ADD CONSTRAINT "washing_operations_task_id_washing_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."washing_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_operations" ADD CONSTRAINT "washing_operations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_operations" ADD CONSTRAINT "washing_operations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_operations" ADD CONSTRAINT "washing_operations_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_operations" ADD CONSTRAINT "washing_operations_admin_reviewed_by_users_id_fk" FOREIGN KEY ("admin_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_schedules" ADD CONSTRAINT "washing_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_schedules" ADD CONSTRAINT "washing_schedules_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_schedules" ADD CONSTRAINT "washing_schedules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_tasks" ADD CONSTRAINT "washing_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_tasks" ADD CONSTRAINT "washing_tasks_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_tasks" ADD CONSTRAINT "washing_tasks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_tasks" ADD CONSTRAINT "washing_tasks_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_tasks" ADD CONSTRAINT "washing_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washing_tasks" ADD CONSTRAINT "washing_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_company_created" ON "audit_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "compounds_company_code" ON "compounds" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "notifications_company" ON "notifications" USING btree ("company_id","is_read");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_company_mobile" ON "owners" USING btree ("company_id","mobile");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_portal_token" ON "owners" USING btree ("portal_token");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_company_code" ON "payments" USING btree ("company_id","payment_code");--> statement-breakpoint
CREATE INDEX "payments_status" ON "payments" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_token" ON "qr_codes" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_vehicle" ON "qr_codes" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_company_name" ON "roles" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_templates_key_lang" ON "sms_templates" USING btree ("company_id","key","lang");--> statement-breakpoint
CREATE INDEX "subvehicles_vehicle" ON "subscription_vehicles" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_company_code" ON "subscriptions" USING btree ("company_id","subscription_code");--> statement-breakpoint
CREATE INDEX "subscriptions_status" ON "subscriptions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_end" ON "subscriptions" USING btree ("company_id","end_date");--> statement-breakpoint
CREATE INDEX "subscriptions_renewed_from" ON "subscriptions" USING btree ("renewed_from_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_compound_number" ON "units" USING btree ("compound_id","unit_number");--> statement-breakpoint
CREATE UNIQUE INDEX "users_company_email" ON "users" USING btree ("company_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_company_code" ON "vehicles" USING btree ("company_id","vehicle_code");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_company_plate" ON "vehicles" USING btree ("company_id","plate_number");--> statement-breakpoint
CREATE INDEX "vehicles_unit" ON "vehicles" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_task" ON "washing_operations" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_vehicle_date" ON "washing_schedules" USING btree ("vehicle_id","scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "task_vehicle_date_active" ON "washing_tasks" USING btree ("vehicle_id","scheduled_date") WHERE "washing_tasks"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "tasks_company_date" ON "washing_tasks" USING btree ("company_id","scheduled_date");