#!/usr/bin/env bash
# Move ALL current subscriptions (active / expiring soon / pending payment) to one plan.
# Keeps each subscription's dates, price paid and washes used; takes washes allowed, weekly frequency and working days
# from the plan, and marks the days for re-balancing (press "Auto-assign days" afterwards, or use --days to do it here).
#
#   bash /opt/carwash/deploy/convert-plan.sh "Single Car Package – Every Other Day"
#   bash /opt/carwash/deploy/convert-plan.sh "Single Car Package – Every Other Day" --all     # include expired/cancelled too
set -euo pipefail
cd "$(dirname "$0")/.."
PLAN="${1:?plan name exactly as shown in Subscription Plans}"; ALL="${2:-}"
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
DBU="${POSTGRES_USER:-carwash}"; DBN="${POSTGRES_DB:-carwash}"
PSQL="$C exec -T db psql -v ON_ERROR_STOP=1 -U $DBU $DBN"
mkdir -p backups; STAMP=$(date +%Y%m%d-%H%M%S)
echo "== Backup → backups/before-convert-$STAMP.sql.gz"
$C exec -T db pg_dump -U "$DBU" "$DBN" | gzip > "backups/before-convert-$STAMP.sql.gz"
PLAN_SQL=$(printf '%s' "$PLAN" | sed "s/'/''/g")
STATUS_FILTER="AND s.status IN ('active','expiring_soon','pending_payment')"; [ "$ALL" = "--all" ] && STATUS_FILTER=""
echo "== Converting subscriptions to \"$PLAN\""
$PSQL <<SQL
BEGIN;
DO \$\$ BEGIN IF (SELECT count(*) FROM subscription_plans WHERE name = '$PLAN_SQL') <> 1 THEN RAISE EXCEPTION 'Plan "$PLAN_SQL" not found (or not unique)'; END IF; END \$\$;
WITH p AS (SELECT * FROM subscription_plans WHERE name = '$PLAN_SQL')
UPDATE subscriptions s SET
  plan_id = p.id,
  plan_snapshot = jsonb_build_object('id', p.id, 'name', p.name, 'nameAr', p.name_ar, 'planType', p.plan_type, 'durationDays', p.duration_days, 'price', p.price, 'allowedDays', p.allowed_days, 'maxFrequencyPerWeek', p.max_frequency_per_week, 'maxWashes', p.max_washes, 'scope', p.scope),
  washes_allowed = GREATEST(p.max_washes, s.washes_used),
  frequency_per_week = p.max_frequency_per_week,
  allowed_days = p.allowed_days,
  updated_at = now()
FROM p WHERE s.company_id = p.company_id AND s.plan_id <> p.id $STATUS_FILTER;
SELECT s.plan_snapshot->>'name' AS plan, s.status, count(*) FROM subscriptions s GROUP BY 1, 2 ORDER BY 1, 2;
COMMIT;
SQL
echo "== Done. Now balance the wash days: Washing Operations → choose the compound → 'Cars per wash day' → 'Auto-assign days'."
echo "   Restore if needed: gunzip -c backups/before-convert-$STAMP.sql.gz | $C exec -T db psql -U $DBU $DBN"
