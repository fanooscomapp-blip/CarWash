#!/usr/bin/env bash
# Move EVERYTHING (units, vehicles, subscriptions, payments, tasks, staff schedules, requests) from one or more
# compounds into a target compound, then delete the emptied compounds. Takes a DB backup first. One transaction.
#
#   bash /opt/carwash/deploy/merge-compounds.sh "MDB7,PHO" MVD
#                                              ^ source compound codes   ^ target compound code
#
# Unit numbers that already exist in the target get the source code as a suffix (A-101 → A-101-MDB7).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?source compound codes, comma separated}"; DST="${2:?target compound code}"
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
DBU="${POSTGRES_USER:-carwash}"; DBN="${POSTGRES_DB:-carwash}"
PSQL="$C exec -T db psql -v ON_ERROR_STOP=1 -U $DBU $DBN"

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
echo "== Backup → backups/before-merge-$STAMP.sql.gz"
$C exec -T db pg_dump -U "$DBU" "$DBN" | gzip > "backups/before-merge-$STAMP.sql.gz"

SRC_SQL=$(echo "$SRC" | sed "s/[[:space:]]//g; s/,/','/g")
echo "== Merging compounds ($SRC) into $DST"
$PSQL <<SQL
BEGIN;
CREATE TEMP TABLE mv AS
  SELECT c.id AS src_id, c.code AS src_code, c.company_id,
         (SELECT id FROM compounds d WHERE d.company_id = c.company_id AND d.code = '$DST') AS dst_id
  FROM compounds c WHERE c.code IN ('$SRC_SQL');
DO \$\$ BEGIN
  IF (SELECT count(*) FROM mv) = 0 THEN RAISE EXCEPTION 'No source compound found for codes $SRC'; END IF;
  IF EXISTS (SELECT 1 FROM mv WHERE dst_id IS NULL) THEN RAISE EXCEPTION 'Target compound $DST not found'; END IF;
END \$\$;

-- units: rename on collision, then move
UPDATE units u SET unit_number = u.unit_number || '-' || mv.src_code
  FROM mv WHERE u.compound_id = mv.src_id
    AND EXISTS (SELECT 1 FROM units t WHERE t.compound_id = mv.dst_id AND t.unit_number = u.unit_number);
UPDATE units u SET compound_id = mv.dst_id FROM mv WHERE u.compound_id = mv.src_id;
UPDATE vehicles v SET compound_id = mv.dst_id FROM mv WHERE v.compound_id = mv.src_id;
UPDATE subscriptions s SET compound_id = mv.dst_id FROM mv WHERE s.compound_id = mv.src_id;
UPDATE payments p SET compound_id = mv.dst_id FROM mv WHERE p.compound_id = mv.src_id;
UPDATE washing_tasks t SET compound_id = mv.dst_id FROM mv WHERE t.compound_id = mv.src_id;
UPDATE registration_requests r SET compound_id = mv.dst_id FROM mv WHERE r.compound_id = mv.src_id;
UPDATE assignment_runs r SET compound_id = mv.dst_id FROM mv WHERE r.compound_id = mv.src_id;
-- plan prices: keep target's own price if it exists, otherwise move
DELETE FROM plan_prices pp USING mv WHERE pp.compound_id = mv.src_id
  AND EXISTS (SELECT 1 FROM plan_prices t WHERE t.compound_id = mv.dst_id AND t.plan_id = pp.plan_id);
UPDATE plan_prices pp SET compound_id = mv.dst_id FROM mv WHERE pp.compound_id = mv.src_id;
-- staff: membership + schedule (sum capacities when the worker already has a cell in the target that day)
INSERT INTO staff_compounds (user_id, compound_id)
  SELECT DISTINCT sc.user_id, mv.dst_id FROM staff_compounds sc JOIN mv ON sc.compound_id = mv.src_id
  ON CONFLICT DO NOTHING;
DELETE FROM staff_compounds sc USING mv WHERE sc.compound_id = mv.src_id;
INSERT INTO staff_schedule (user_id, dow, compound_id, capacity)
  SELECT s.user_id, s.dow, mv.dst_id, sum(s.capacity) FROM staff_schedule s JOIN mv ON s.compound_id = mv.src_id
  GROUP BY s.user_id, s.dow, mv.dst_id
  ON CONFLICT (user_id, dow, compound_id) DO UPDATE SET capacity = staff_schedule.capacity + EXCLUDED.capacity;
DELETE FROM staff_schedule s USING mv WHERE s.compound_id = mv.src_id;
-- finally the emptied compounds
DELETE FROM compounds c USING mv WHERE c.id = mv.src_id;

SELECT c.code, c.name,
  (SELECT count(*) FROM units u WHERE u.compound_id = c.id) AS units,
  (SELECT count(*) FROM vehicles v WHERE v.compound_id = c.id) AS vehicles,
  (SELECT count(*) FROM subscriptions s WHERE s.compound_id = c.id) AS subscriptions
FROM compounds c ORDER BY c.name;
COMMIT;
SQL
echo "== Done. Restart not needed. If something looks wrong, restore with:"
echo "   gunzip -c backups/before-merge-$STAMP.sql.gz | $C exec -T db psql -U $DBU $DBN"
