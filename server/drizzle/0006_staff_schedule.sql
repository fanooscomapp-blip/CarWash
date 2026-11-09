CREATE TABLE "staff_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dow" integer NOT NULL,
	"compound_id" uuid NOT NULL,
	"capacity" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_schedule" ADD CONSTRAINT "staff_schedule_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedule" ADD CONSTRAINT "staff_schedule_compound_id_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."compounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_schedule_unique" ON "staff_schedule" USING btree ("user_id","dow","compound_id");--> statement-breakpoint
CREATE INDEX "staff_schedule_compound_dow" ON "staff_schedule" USING btree ("compound_id","dow");--> statement-breakpoint
INSERT INTO "staff_schedule" ("user_id", "dow", "compound_id", "capacity")
SELECT u.id, d.dow, sc.compound_id, COALESCE(u.daily_capacity, 32)
FROM users u JOIN staff_compounds sc ON sc.user_id = u.id
CROSS JOIN generate_series(0, 6) AS d(dow)
WHERE u.user_type = 'staff' AND u.work_days @> to_jsonb(ARRAY[d.dow])
ON CONFLICT DO NOTHING;
