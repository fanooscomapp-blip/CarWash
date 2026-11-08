# Car Wash Management System — Phase 1

Multi-compound, subscription-based car wash platform. **Phase 1** delivers the database for the whole product, authentication & role-based access, and the complete Admin Portal for compounds, units, owners, vehicles, plans, subscriptions, renewals and payment approval.

| Layer | Stack |
|---|---|
| API | Node.js 22 · Express 5 · Drizzle ORM · PostgreSQL 16 · Zod · JWT · bcrypt |
| Admin portal | React 19 · Vite · Tailwind v4 · Recharts · EN/AR with full RTL |
| Ops | Docker Compose (app + Postgres + nightly backups) |

---

## 1. Run with Docker (recommended)

```bash
cp .env.example .env
# edit .env → set JWT_SECRET (openssl rand -hex 32) and change POSTGRES_PASSWORD
docker compose up -d --build
```

Open **http://localhost:4000** → login `admin@carwash.local` / `Admin@12345` (from `.env`; change it after first login in Settings).

On first start the app runs migrations and, if the database is empty, seeds system roles, SMS templates, the admin user and — when `SEED_DEMO=true` — realistic demo data (3 compounds, 16 units, 22 vehicles, subscriptions in every status). Demo rows are flagged `is_demo = true` so they can be separated from production records. Set `SEED_DEMO=false` before the first start of a production instance.

Database backups are written nightly to `./backups/*.sql.gz` (14-day retention).

## 2. Run locally for development

```bash
# Postgres on localhost:5432 with a database named carwash
cd server && cp .env.example .env && npm install && npm run dev        # API on :4000 (migrates + seeds automatically)
cd client && npm install && npm run dev                                 # Vite on :5173, proxies /api → :4000
```

Other scripts: `npm run generate` (new SQL migration after editing `src/db/schema.js`), `npm run migrate`, `npm run seed`, `npm test` (end-to-end API test against a running server).

---

## 3. What Phase 1 contains

**Admin portal screens:** Login · Executive dashboard (13 KPIs, subscription/revenue/renewal analytics, status mix, renewal conversion, compound & date filters) · Compounds (list, detail with revenue trend, activate/deactivate, staff assignment) · Units & customers (inline owner creation, vehicles / subscription / payment history) · Owners · Vehicles (system-generated `VH-xxxxxx` ID, photo upload, current-subscription column, QR token) · Subscription plans (types, washing days, quotas, scope, per-compound & per-vehicle-type price overrides) · Subscriptions (5-step wizard, filters, detail with renewal chain timeline) · Quick renewal modal (plan → start date → price/discount → paid or pending) · Renewal management (7/15/30 days, expired, pending, renewed with live counters) · Payments (approve / reject with reason, receipt upload & protected viewing, totals) · Users & roles (permission matrix, system roles) · System settings (company, rules, bank, SMS provider, OTP, photo requirements, notification rules, password change) · Audit logs (before/after diff viewer) · In-app notification centre.

**Business rules enforced server-side**
- Subscription status engine: `pending_payment → active → expiring_soon → expired`, plus `suspended` / `cancelled`; recomputed in SQL before every listing, hourly, and nightly. "Expiring soon" window is configurable.
- A vehicle cannot hold two live subscriptions over overlapping dates; vehicles must belong to the selected unit; plan scope (`per_vehicle` / `per_unit` / `multi_vehicle`) and `maxVehicles` are validated; discount cannot exceed price.
- Pricing resolves the most specific override: compound + vehicle type → compound → vehicle type → base price.
- Renewals never overwrite history: a renewal creates a new subscription linked by `renewed_from_id`, a `subscription_renewals` record and a payment. A subscription cannot be renewed twice.
- Payment approval runs in a transaction with row locks: double approval is rejected; approval activates the subscription and completes the renewal. Rejection requires a reason and sets `awaiting_new_receipt`.
- Receipts and vehicle photos are stored outside the web root and streamed only through authenticated, permission-checked endpoints.
- Every create/update/approve/reject/status change writes an `audit_logs` row with before/after snapshots, actor and IP.
- Multi-tenant: every table carries `company_id`; all queries are scoped by the authenticated user's company.
- "Today" is evaluated in the business timezone (`TZ`, default `Africa/Cairo`) both in Node and in the Postgres session.

**Security:** bcrypt password hashing · JWT sessions with expiry · login rate limiting · RBAC enforced per route (`requirePermission`) · admin-portal routes reject staff accounts · Helmet headers · Zod validation on every input · unique and FK constraints mapped to clean 409 responses.

## 4. Scaffolded for later phases

The schema already contains **all 24 entities** from the specification (washing schedules/tasks/operations, before/after photos, SMS templates & logs, OTP codes, QR codes, staff compound assignments…), the permission catalogue includes the staff-portal permissions, SMS templates (EN/AR) are seeded, and the SMS/OTP/photo settings screens are in place. Nothing simulates external delivery: SMS status stays `not_configured` until a provider is configured.

| Phase | Scope |
|---|---|
| 2 | Owner portal (OTP login, my vehicles, renewal request, receipt upload, tracking), admin approval notifications, SMS provider adapter |
| 3 | Staff portal, task assignment & task pool, washing workflow with mandatory before/after photos, validation engine (quota, allowed days, duplicates), admin operations monitoring |
| 4 | Scheduled SMS reminders, QR printing/scanning, reports & Excel/PDF export, staff performance |
| 5 | Security review, responsive & workflow testing, performance tuning |

## 5. Demo accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@carwash.local | Admin@12345 |
| Operations Manager | ops@carwash.local | Ops@12345 |
| Car Wash Staff (Phase 3 portal) | staff1@carwash.local | Staff@12345 |

## 6. Project layout

```
server/
  src/db/schema.js          # all entities (Drizzle) → drizzle/ SQL migrations
  src/db/seed.js            # base data + demo data
  src/services/             # subscriptionService (status engine, renewals, payments), settings, notifications, automation (cron)
  src/routes/               # REST API: auth, compounds, units, owners, vehicles, plans, subscriptions, payments, dashboard, users, settings, misc
  src/middleware/auth.js    # JWT + RBAC
  test/api.test.js          # 29-step end-to-end API test
client/
  src/pages/                # one file per admin screen
  src/components/           # ui kit, layout, renew modal, subscription tables
  src/i18n/{en,ar}.js       # translations
```
