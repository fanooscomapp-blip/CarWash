# Deployment guide

The app is one Docker image (API + admin portal) that needs a PostgreSQL database and somewhere to keep uploaded files. Migrations and seeding run automatically on first start.

## Option A — Free (testing / demo): Render + Neon + Cloudflare R2

| Piece | Service | Free limits |
|---|---|---|
| App | Render web service (free) | 750 h/month, spins down after 15 min idle (~1 min cold start) |
| Database | Neon Postgres (free) | 1 GB storage, no expiry, auto-suspends when idle |
| Files (receipts, photos) | Cloudflare R2 (free) | 10 GB storage, no egress fees |

1. **Neon** → New project → copy the connection string (`postgres://...neon.tech/neondb?sslmode=require`).
2. **Cloudflare R2** → Create bucket `carwash-files` → *Manage R2 API tokens* → create a token with Object Read & Write → note *Access Key ID*, *Secret Access Key* and the S3 endpoint `https://<accountid>.r2.cloudflarestorage.com`.
3. **Render** → New → *Blueprint* → pick this GitHub repo. Render reads `render.yaml` and asks for the secret values: `DATABASE_URL`, `ADMIN_PASSWORD`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Deploy.
4. Open the Render URL → log in with `admin@carwash.local` and the password you set.

Notes: Render's own free Postgres is deleted after 30 days — that is why Neon is used. The in-app scheduler cannot run while the free service is asleep; subscription statuses are still recomputed on every page load, and for Phase 4 SMS reminders a free external pinger (e.g. cron-job.org hitting `/api/health` every 10 minutes) keeps the service awake, or upgrade to Starter.

## Option B — Cheap & always-on (~$5/month): Railway Hobby

Everything in one place: app, Postgres and a persistent volume for files; no cold starts.

1. Railway → New project → *Deploy from GitHub repo* → this repo (the `Dockerfile` and `railway.json` are detected).
2. In the project: *+ New* → *Database* → **PostgreSQL**.
3. App service → *Variables*: `DATABASE_URL = ${{Postgres.DATABASE_URL}}`, `JWT_SECRET` (random 64 hex), `ADMIN_PASSWORD`, `TZ=Africa/Cairo`, `SEED_DEMO=false` (or true for demo data), `UPLOADS_DIR=/data`.
4. App service → *Settings* → *Volumes* → mount a volume at `/data` (files persist across deploys).
5. *Settings* → *Networking* → Generate domain. Done.

(Alternative to the volume: skip step 4 and set the `STORAGE_DRIVER=s3` + `S3_*` variables to use R2 as in Option A.)

## Option C — Own VPS (€4–5/month, e.g. Hetzner CX22)

`git clone` the repo, `cp .env.example .env`, fill it, `docker compose up -d --build`. This runs Postgres, the app and the nightly backup container exactly as in development. Put Caddy or Nginx in front for HTTPS.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first run | Created only when the DB is empty |
| `SEED_DEMO` | no | `true` loads demo data on first run |
| `TZ` | no | Business timezone, default `Africa/Cairo` |
| `UPLOADS_DIR` | no | Local file folder (must be a persistent volume) |
| `STORAGE_DRIVER` | no | `local` (default) or `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | with s3 | Works with R2, Supabase Storage, AWS S3, MinIO |
| `PORT` | no | Default 4000 (Render/Railway inject their own) |

## Option D — Hostinger VPS (KVM 1 is enough)

Hostinger **shared/web hosting will not work** (no Docker, no long-running Node process, MySQL only). You need a **VPS**: *KVM 1* (1 vCPU, 4 GB RAM, 50 GB NVMe) is more than enough for this app + Postgres; the stack uses well under 1 GB RAM.

1. Buy VPS KVM 1 → when choosing the OS pick **"Docker"** (Ubuntu with Docker preinstalled) — plain Ubuntu 24.04 also works.
2. Point your domain's **A record** to the VPS IP (Hostinger DNS or wherever the domain lives).
3. Open Hostinger's **Browser terminal** (VPS → Overview) and run:
   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/fanooscomapp-blip/CarWash/main/deploy/hostinger-vps-setup.sh)
   ```
   It installs Docker if missing, opens ports 80/443, clones the repo, generates secrets, asks for your domain, and starts the app with automatic HTTPS (Caddy). It prints the admin password at the end.
4. Updates later: `cd /opt/carwash && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.

Backups are written nightly to `/opt/carwash/backups`; Hostinger's own weekly VPS snapshots are a second layer.
