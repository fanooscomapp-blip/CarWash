#!/usr/bin/env bash
# Remove ALL demo sample data (owners/units/vehicles/subscriptions flagged is_demo and everything attached to them:
# payments, receipts, wash tasks/records/photos, SMS logs, OTP codes, reminders, renewal records). Staff, admins,
# plans, settings and real customers are untouched. Takes a backup first; one transaction.
#
#   bash /opt/carwash/deploy/purge-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
DBU="${POSTGRES_USER:-carwash}"; DBN="${POSTGRES_DB:-carwash}"
PSQL="$C exec -T db psql -v ON_ERROR_STOP=1 -U $DBU $DBN"
mkdir -p backups; STAMP=$(date +%Y%m%d-%H%M%S)
echo "== Backup → backups/before-purge-demo-$STAMP.sql.gz"
$C exec -T db pg_dump -U "$DBU" "$DBN" | gzip > "backups/before-purge-demo-$STAMP.sql.gz"
echo "== Removing demo data"
$PSQL <<'SQL'
BEGIN;
-- everything that belongs to a demo owner, a demo unit or a demo vehicle
CREATE TEMP TABLE d_owner AS SELECT id FROM owners WHERE is_demo = true;
CREATE TEMP TABLE d_vehicle AS SELECT id FROM vehicles WHERE is_demo = true OR owner_id IN (SELECT id FROM d_owner) OR unit_id IN (SELECT id FROM units WHERE is_demo = true);
CREATE TEMP TABLE d_sub AS SELECT id FROM subscriptions WHERE is_demo = true OR owner_id IN (SELECT id FROM d_owner) OR id IN (SELECT subscription_id FROM subscription_vehicles WHERE vehicle_id IN (SELECT id FROM d_vehicle));
CREATE TEMP TABLE d_unit AS SELECT id FROM units WHERE is_demo = true OR owner_id IN (SELECT id FROM d_owner);

SELECT (SELECT count(*) FROM d_owner) AS owners, (SELECT count(*) FROM d_unit) AS units, (SELECT count(*) FROM d_vehicle) AS vehicles, (SELECT count(*) FROM d_sub) AS subscriptions;

DELETE FROM wash_photos WHERE operation_id IN (SELECT id FROM washing_operations WHERE vehicle_id IN (SELECT id FROM d_vehicle) OR subscription_id IN (SELECT id FROM d_sub));
DELETE FROM washing_operations WHERE vehicle_id IN (SELECT id FROM d_vehicle) OR subscription_id IN (SELECT id FROM d_sub);
DELETE FROM washing_tasks WHERE vehicle_id IN (SELECT id FROM d_vehicle) OR subscription_id IN (SELECT id FROM d_sub);
DELETE FROM payment_receipts WHERE payment_id IN (SELECT id FROM payments WHERE subscription_id IN (SELECT id FROM d_sub) OR owner_id IN (SELECT id FROM d_owner));
UPDATE payments SET renewal_id = NULL WHERE renewal_id IN (SELECT id FROM subscription_renewals WHERE new_subscription_id IN (SELECT id FROM d_sub) OR previous_subscription_id IN (SELECT id FROM d_sub));
DELETE FROM payments WHERE subscription_id IN (SELECT id FROM d_sub) OR owner_id IN (SELECT id FROM d_owner);
DELETE FROM subscription_renewals WHERE new_subscription_id IN (SELECT id FROM d_sub) OR previous_subscription_id IN (SELECT id FROM d_sub);
DELETE FROM subscription_reminders WHERE subscription_id IN (SELECT id FROM d_sub);
DELETE FROM subscription_vehicles WHERE subscription_id IN (SELECT id FROM d_sub) OR vehicle_id IN (SELECT id FROM d_vehicle);
UPDATE subscriptions SET renewed_from_id = NULL WHERE renewed_from_id IN (SELECT id FROM d_sub);
DELETE FROM subscriptions WHERE id IN (SELECT id FROM d_sub);
DELETE FROM qr_codes WHERE vehicle_id IN (SELECT id FROM d_vehicle);
DELETE FROM vehicles WHERE id IN (SELECT id FROM d_vehicle);
DELETE FROM units WHERE id IN (SELECT id FROM d_unit);
DELETE FROM sms_logs WHERE owner_id IN (SELECT id FROM d_owner);
DELETE FROM otp_codes WHERE owner_id IN (SELECT id FROM d_owner);
DELETE FROM owner_sessions WHERE owner_id IN (SELECT id FROM d_owner);
DELETE FROM registration_requests WHERE mobile IN (SELECT mobile FROM owners WHERE id IN (SELECT id FROM d_owner)) AND status <> 'approved';
DELETE FROM owners WHERE id IN (SELECT id FROM d_owner);
-- demo compounds that are now empty
DELETE FROM compounds c WHERE c.is_demo = true
  AND NOT EXISTS (SELECT 1 FROM units u WHERE u.compound_id = c.id) AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.compound_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.compound_id = c.id) AND NOT EXISTS (SELECT 1 FROM staff_schedule ss WHERE ss.compound_id = c.id);

SELECT (SELECT count(*) FROM owners) AS owners_left, (SELECT count(*) FROM vehicles) AS vehicles_left, (SELECT count(*) FROM subscriptions) AS subscriptions_left, (SELECT count(*) FROM compounds) AS compounds_left;
COMMIT;
SQL
echo "== Done. Restore if needed: gunzip -c backups/before-purge-demo-$STAMP.sql.gz | $C exec -T db psql -U $DBU $DBN"
