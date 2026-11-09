#!/usr/bin/env bash
# Pull the latest code and redeploy. Run on the server:  bash /opt/carwash/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
echo "Updated. $(git log -1 --pretty='%h %s')"
