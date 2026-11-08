#!/usr/bin/env bash
# One-shot setup for a fresh Hostinger VPS (choose the "Docker" OS template, or Ubuntu 24.04 — Docker is installed if missing).
# Run as root:  bash <(curl -fsSL https://raw.githubusercontent.com/fanooscomapp-blip/CarWash/main/deploy/hostinger-vps-setup.sh)
set -euo pipefail
REPO_URL="${REPO_URL:-https://github.com/fanooscomapp-blip/CarWash.git}"
APP_DIR="${APP_DIR:-/opt/carwash}"

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
docker compose version >/dev/null 2>&1 || apt-get install -y docker-compose-plugin
apt-get install -y git ufw >/dev/null
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

if [ ! -d "$APP_DIR" ]; then git clone "$REPO_URL" "$APP_DIR"; fi
cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d '/+=')|" .env
  read -rp "Domain pointing to this server (e.g. carwash.example.com): " DOMAIN
  echo "DOMAIN=$DOMAIN" >> .env
  sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" .env
  read -rp "Load demo data? (y/N): " DEMO; [ "${DEMO,,}" = "y" ] || sed -i "s|^SEED_DEMO=.*|SEED_DEMO=false|" .env
fi
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo; echo "Done. Open https://$(grep ^DOMAIN= .env | cut -d= -f2)"
echo "Admin login: $(grep ^ADMIN_EMAIL= .env | cut -d= -f2) / $(grep ^ADMIN_PASSWORD= .env | cut -d= -f2)"
