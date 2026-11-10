ALTER TABLE "vehicles" ADD COLUMN "gps_source" varchar(10);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "gps_updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "vehicles" SET "gps_source" = 'owner' WHERE "gps_lat" IS NOT NULL AND "gps_source" IS NULL;--> statement-breakpoint
UPDATE "vehicles" v SET "gps_lat" = o.start_lat, "gps_lng" = o.start_lng, "gps_source" = 'staff', "gps_updated_at" = o.start_time
FROM (SELECT DISTINCT ON (vehicle_id) vehicle_id, start_lat, start_lng, start_time FROM washing_operations WHERE start_lat IS NOT NULL AND status = 'completed' ORDER BY vehicle_id, start_time DESC) o
WHERE o.vehicle_id = v.id AND v.gps_lat IS NULL;
