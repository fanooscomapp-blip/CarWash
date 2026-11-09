#!/usr/bin/env bash
# Health check for the live server. Run:  bash /opt/carwash/deploy/check.sh
# Prints: code version, containers, API health, DB migrations, recent errors, disk, backups. Read-only.
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
line() { printf '\n== %s ==\n' "$1"; }

line "Code version"; git log -1 --pretty='%h %ad %s' --date=short; git status --short | head -5
line "Containers"; $C ps
line "API health (inside server)"; curl -s -m 5 http://localhost:4000/api/health || echo "API not reachable on :4000"
line "HTTPS health"; D=$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2); [ -n "$D" ] && curl -s -m 8 "https://$D/api/health" || echo "DOMAIN not set in .env"
line "Database"; $C exec -T db psql -U "${POSTGRES_USER:-carwash}" "${POSTGRES_DB:-carwash}" -c "SELECT count(*) AS migrations, max(created_at) AS last FROM drizzle.__drizzle_migrations;" 2>/dev/null || echo "cannot query migrations"
$C exec -T db psql -U "${POSTGRES_USER:-carwash}" "${POSTGRES_DB:-carwash}" -c "SELECT (SELECT count(*) FROM compounds WHERE status='active') AS compounds, (SELECT count(*) FROM owners) AS owners, (SELECT count(*) FROM vehicles WHERE status='active') AS vehicles, (SELECT count(*) FROM subscriptions WHERE status IN ('active','expiring_soon')) AS active_subs, (SELECT count(*) FROM users WHERE user_type='staff' AND is_active) AS staff, (SELECT count(*) FROM washing_tasks WHERE scheduled_date = CURRENT_DATE) AS tasks_today, (SELECT count(*) FROM sms_logs WHERE status='failed' AND created_at > now() - interval '1 day') AS sms_failed_24h;" 2>/dev/null
line "Errors in app log (last 24h, last 20)"; $C logs --since 24h app 2>/dev/null | grep -iE 'error|exception|unhandled' | tail -20 || true
line "Disk"; df -h / | tail -1; du -sh ./uploads 2>/dev/null; du -sh ./backups 2>/dev/null
line "Backups (latest 3)"; ls -lt backups 2>/dev/null | head -4
line "Caddy (HTTPS) last lines"; $C logs --tail 5 caddy 2>/dev/null || true
echo; echo "Done."
