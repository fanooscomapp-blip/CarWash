import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, or, getTableColumns, desc, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, ilike, today } from '../lib/util.js';
import { suggestWashDays, dayLoads, busyDays } from '../services/washDaysService.js';
import { createSubscription, renewSubscription, refreshStatuses, changeSubscriptionStatus, SUB_STATUS } from '../services/subscriptionService.js';

const router = Router();
const { subscriptions, subscriptionPlans, units, owners, compounds, vehicles, subscriptionVehicles, payments, subscriptionRenewals } = schema;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createSchema = z.object({
  compoundId: z.string().uuid().optional(),
  unitId: z.string().uuid(),
  vehicleIds: z.array(z.string().uuid()).min(1),
  planId: z.string().uuid(),
  startDate: dateStr.optional(),
  durationDays: z.coerce.number().int().min(1).optional(),
  washesAllowed: z.coerce.number().int().min(1).optional(),
  allowedDays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  frequencyPerWeek: z.coerce.number().int().min(1).max(7).optional(),
  price: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'other']).optional(),
  paymentStatus: z.enum(['paid', 'pending']).optional(),
  notes: z.string().max(5000).optional().nullable(),
  paymentNotes: z.string().max(2000).optional().nullable(),
});
const renewSchema = createSchema.partial().omit({ unitId: true, compoundId: true });

const listSelect = () => ({
  ...getTableColumns(subscriptions),
  planName: subscriptionPlans.name, planNameAr: subscriptionPlans.nameAr,
  unitNumber: units.unitNumber, compoundName: compounds.name, ownerName: owners.name, ownerMobile: owners.mobile,
  plates: sql`(SELECT string_agg(v.plate_number, ', ' ORDER BY v.plate_number) FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${subscriptions.id})`,
  vehicleIds: sql`(SELECT array_agg(sv.vehicle_id) FROM subscription_vehicles sv WHERE sv.subscription_id = ${subscriptions.id})`,
  daysRemaining: sql`(${subscriptions.endDate} - CURRENT_DATE)`.mapWith(Number),
  renewedToId: sql`(SELECT s2.id FROM subscriptions s2 WHERE s2.renewed_from_id = ${subscriptions.id} AND s2.status <> 'cancelled' LIMIT 1)`,
  renewedToStatus: sql`(SELECT s2.status FROM subscriptions s2 WHERE s2.renewed_from_id = ${subscriptions.id} AND s2.status <> 'cancelled' LIMIT 1)`,
  pendingPaymentId: sql`(SELECT p.id FROM payments p WHERE p.subscription_id = ${subscriptions.id} AND p.status IN ('pending_verification','awaiting_new_receipt') ORDER BY p.created_at DESC LIMIT 1)`,
});

const joined = (q) => q.from(subscriptions)
  .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
  .innerJoin(units, eq(units.id, subscriptions.unitId))
  .innerJoin(compounds, eq(compounds.id, subscriptions.compoundId))
  .innerJoin(owners, eq(owners.id, subscriptions.ownerId));

function buildWhere(req) {
  const { search, compoundId, status, planId, ownerId, unitId, vehicleId, window, dateFrom, dateTo, month, kind } = req.query;
  const statuses = status ? String(status).split(',').filter((s) => SUB_STATUS.includes(s)) : [];
  return and(
    eq(subscriptions.companyId, req.companyId),
    compoundId ? eq(subscriptions.compoundId, compoundId) : undefined,
    planId ? eq(subscriptions.planId, planId) : undefined,
    ownerId ? eq(subscriptions.ownerId, ownerId) : undefined,
    unitId ? eq(subscriptions.unitId, unitId) : undefined,
    statuses.length ? inArray(subscriptions.status, statuses) : undefined,
    vehicleId ? sql`EXISTS (SELECT 1 FROM subscription_vehicles sv WHERE sv.subscription_id = ${subscriptions.id} AND sv.vehicle_id = ${vehicleId})` : undefined,
    dateFrom ? sql`${subscriptions.endDate} >= ${dateFrom}` : undefined,
    dateTo ? sql`${subscriptions.endDate} <= ${dateTo}` : undefined,
    window ? sql`${subscriptions.endDate} BETWEEN CURRENT_DATE AND CURRENT_DATE + ${Number(window)}::int` : undefined,
    month && /^\d{4}-\d{2}$/.test(month) ? sql`to_char(${subscriptions.createdAt}, 'YYYY-MM') = ${month}` : undefined,
    kind === 'new' ? sql`${subscriptions.renewedFromId} IS NULL` : kind === 'renewal' ? sql`${subscriptions.renewedFromId} IS NOT NULL` : undefined,
    search ? or(ilike(subscriptions.subscriptionCode, search), ilike(owners.name, search), ilike(owners.mobile, search), ilike(units.unitNumber, search),
      sql`EXISTS (SELECT 1 FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${subscriptions.id} AND v.plate_number ILIKE ${'%' + search + '%'})`) : undefined,
  );
}

router.get('/', requirePermission('subscriptions.view'), wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const pg = parsePagination(req.query);
  const where = buildWhere(req);
  const sort = req.query.sort === 'endDate' ? subscriptions.endDate : desc(subscriptions.createdAt);
  const rows = await joined(db.select(listSelect())).where(where).orderBy(sort).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await joined(db.select({ count: sql`count(*)`.mapWith(Number) })).where(where);
  res.json(paged(rows, count, pg));
}));

// Renewal management screen: current (latest per vehicle chain) subscriptions grouped by expiry windows
router.get('/renewals', requirePermission('subscriptions.view'), wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const { filter = '7', compoundId, search } = req.query;
  const pg = parsePagination(req.query);
  const notRenewed = sql`NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = ${subscriptions.id} AND s2.status <> 'cancelled')`;
  const filterSql = {
    '7': and(inArray(subscriptions.status, ['active', 'expiring_soon']), sql`${subscriptions.endDate} <= CURRENT_DATE + 7`, notRenewed),
    '15': and(inArray(subscriptions.status, ['active', 'expiring_soon']), sql`${subscriptions.endDate} <= CURRENT_DATE + 15`, notRenewed),
    '30': and(inArray(subscriptions.status, ['active', 'expiring_soon']), sql`${subscriptions.endDate} <= CURRENT_DATE + 30`, notRenewed),
    expiring: and(eq(subscriptions.status, 'expiring_soon'), notRenewed),
    expired: and(eq(subscriptions.status, 'expired'), notRenewed),
    pending: sql`EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = ${subscriptions.id} AND s2.status = 'pending_payment')`,
    renewed: sql`EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = ${subscriptions.id} AND s2.status IN ('active','expiring_soon','expired'))`,
  }[filter];
  if (!filterSql) throw notFound('Filter');
  const where = and(eq(subscriptions.companyId, req.companyId), filterSql, compoundId ? eq(subscriptions.compoundId, compoundId) : undefined,
    search ? or(ilike(owners.name, search), ilike(owners.mobile, search), ilike(units.unitNumber, search), ilike(subscriptions.subscriptionCode, search),
      sql`EXISTS (SELECT 1 FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${subscriptions.id} AND v.plate_number ILIKE ${'%' + search + '%'})`) : undefined);
  const rows = await joined(db.select({ ...listSelect(), renewalPrice: sql`${subscriptionPlans.price}`.mapWith(Number) })).where(where).orderBy(subscriptions.endDate).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await joined(db.select({ count: sql`count(*)`.mapWith(Number) })).where(where);
  // Counters for the filter tabs
  const counters = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status IN ('active','expiring_soon') AND end_date <= CURRENT_DATE + 7 AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status <> 'cancelled'))::int AS d7,
      count(*) FILTER (WHERE status IN ('active','expiring_soon') AND end_date <= CURRENT_DATE + 15 AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status <> 'cancelled'))::int AS d15,
      count(*) FILTER (WHERE status IN ('active','expiring_soon') AND end_date <= CURRENT_DATE + 30 AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status <> 'cancelled'))::int AS d30,
      count(*) FILTER (WHERE status = 'expiring_soon' AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status <> 'cancelled'))::int AS expiring,
      count(*) FILTER (WHERE status = 'expired' AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status <> 'cancelled'))::int AS expired,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status = 'pending_payment'))::int AS pending,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status IN ('active','expiring_soon','expired')))::int AS renewed
    FROM subscriptions s WHERE company_id = ${req.companyId} ${compoundId ? sql`AND compound_id = ${compoundId}` : sql``}`).then((r) => (r.rows || r)[0]);
  res.json({ ...paged(rows, count, pg), counters });
}));

// Wash-day pattern suggestion for the wizard / join approval (load-balanced, same-owner preference)
router.get('/suggest-days', requirePermission('subscriptions.view'), wrap(async (req, res) => {
  const q = z.object({ compoundId: z.string().uuid(), planId: z.string().uuid(), perWeek: z.coerce.number().int().min(1).max(7).optional(), ownerId: z.string().uuid().optional(), unitId: z.string().uuid().optional(), excludeSubscriptionId: z.string().uuid().optional() }).parse(req.query);
  const plan = await db.query.subscriptionPlans.findFirst({ where: and(eq(schema.subscriptionPlans.id, q.planId), eq(schema.subscriptionPlans.companyId, req.companyId)) });
  if (!plan) throw notFound('Plan');
  let ownerId = q.ownerId; if (!ownerId && q.unitId) ownerId = (await db.query.units.findFirst({ where: eq(schema.units.id, q.unitId) }))?.ownerId;
  const perWeek = q.perWeek ?? plan.maxFrequencyPerWeek;
  const r = await suggestWashDays(req.companyId, { compoundId: q.compoundId, workingDays: plan.allowedDays, perWeek, ownerId, excludeSubscriptionId: q.excludeSubscriptionId });
  res.json({ ...r, workingDays: plan.allowedDays, perWeek, busy: busyDays(r.loads, plan.allowedDays), fixedPattern: perWeek < plan.allowedDays.length });
}));

router.get('/day-loads', requirePermission('subscriptions.view'), wrap(async (req, res) => {
  const { compoundId } = z.object({ compoundId: z.string().uuid() }).parse(req.query);
  const loads = await dayLoads(req.companyId, compoundId);
  const unbalanced = (await db.execute(sql`SELECT count(*)::int AS n FROM subscriptions WHERE company_id = ${req.companyId} AND compound_id = ${compoundId} AND payment_status = 'paid' AND status IN ('active','expiring_soon') AND jsonb_array_length(allowed_days) > frequency_per_week`)).rows?.[0]?.n ?? 0;
  res.json({ loads, unbalanced });
}));

// One-time fix for existing subscriptions whose allowed days exceed their weekly frequency → give each a balanced fixed pattern
router.post('/auto-assign-days', requirePermission('subscriptions.manage'), wrap(async (req, res) => {
  const { compoundId } = z.object({ compoundId: z.string().uuid().optional() }).parse(req.body || {});
  const list = (await db.execute(sql`SELECT id, compound_id, owner_id, allowed_days, frequency_per_week FROM subscriptions WHERE company_id = ${req.companyId} ${compoundId ? sql`AND compound_id = ${compoundId}` : sql``} AND payment_status = 'paid' AND status IN ('active','expiring_soon') AND jsonb_array_length(allowed_days) > frequency_per_week ORDER BY owner_id, created_at`)).rows;
  const changed = [];
  for (const s of list) {
    const r = await suggestWashDays(req.companyId, { compoundId: s.compound_id, workingDays: s.allowed_days, perWeek: s.frequency_per_week, ownerId: s.owner_id, excludeSubscriptionId: s.id });
    await db.update(schema.subscriptions).set({ allowedDays: r.suggested, updatedAt: new Date() }).where(eq(schema.subscriptions.id, s.id));
    changed.push({ id: s.id, from: s.allowed_days, to: r.suggested });
  }
  await audit(req, { action: 'subscription.auto_assign_days', entityType: 'subscription', after: { compoundId, count: changed.length } });
  res.json({ count: changed.length, changed });
}));

// Exception: customer asks for different days (e.g. travels on Thursday) — admin picks them, frequency unchanged
router.put('/:id/days', requirePermission('subscriptions.manage'), wrap(async (req, res) => {
  const { allowedDays } = z.object({ allowedDays: z.array(z.number().int().min(0).max(6)).min(1).max(7) }).parse(req.body);
  const before = await db.query.subscriptions.findFirst({ where: and(eq(schema.subscriptions.id, req.params.id), eq(schema.subscriptions.companyId, req.companyId)) });
  if (!before) throw notFound('Subscription');
  const days = [...new Set(allowedDays)].sort();
  const [row] = await db.update(schema.subscriptions).set({ allowedDays: days, frequencyPerWeek: Math.min(before.frequencyPerWeek, days.length) || before.frequencyPerWeek, updatedAt: new Date() }).where(eq(schema.subscriptions.id, before.id)).returning();
  await audit(req, { action: 'subscription.days', entityType: 'subscription', entityId: row.id, before: { allowedDays: before.allowedDays }, after: { allowedDays: row.allowedDays } });
  res.json(row);
}));

router.get('/:id', requirePermission('subscriptions.view'), wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const [sub] = await joined(db.select(listSelect())).where(and(eq(subscriptions.id, req.params.id), eq(subscriptions.companyId, req.companyId)));
  if (!sub) throw notFound('Subscription');
  const vehicleRows = await db.select(getTableColumns(vehicles)).from(subscriptionVehicles).innerJoin(vehicles, eq(vehicles.id, subscriptionVehicles.vehicleId)).where(eq(subscriptionVehicles.subscriptionId, sub.id));
  const pays = await db.query.payments.findMany({ where: eq(payments.subscriptionId, sub.id), with: { receipts: true }, orderBy: [desc(payments.createdAt)] });
  // Walk the renewal chain both directions for history
  const chain = await db.execute(sql`
    WITH RECURSIVE back AS (SELECT * FROM subscriptions WHERE id = ${sub.id}
      UNION ALL SELECT s.* FROM subscriptions s JOIN back b ON s.id = b.renewed_from_id),
    fwd AS (SELECT * FROM subscriptions WHERE id = ${sub.id}
      UNION ALL SELECT s.* FROM subscriptions s JOIN fwd f ON s.renewed_from_id = f.id)
    SELECT DISTINCT id, subscription_code, start_date::text, end_date::text, status, final_amount, plan_snapshot->>'name' AS plan_name, created_at FROM (SELECT * FROM back UNION SELECT * FROM fwd) x ORDER BY start_date`).then((r) => r.rows || r);
  const renewals = await db.select().from(subscriptionRenewals).where(or(eq(subscriptionRenewals.previousSubscriptionId, sub.id), eq(subscriptionRenewals.newSubscriptionId, sub.id))).orderBy(desc(subscriptionRenewals.createdAt));
  res.json({ ...sub, vehicles: vehicleRows, payments: pays, history: chain, renewals, washingHistory: [] });
}));

router.post('/', requirePermission('subscriptions.manage'), wrap(async (req, res) => {
  const body = createSchema.parse(req.body);
  const result = await createSubscription(req, body);
  res.status(201).json(result);
}));

router.post('/:id/renew', requirePermission('subscriptions.renew', 'subscriptions.manage'), wrap(async (req, res) => {
  const body = renewSchema.parse(req.body);
  const result = await renewSubscription(req, req.params.id, body);
  res.status(201).json(result);
}));

for (const action of ['cancel', 'suspend', 'resume']) {
  router.post(`/:id/${action}`, requirePermission('subscriptions.manage'), wrap(async (req, res) => {
    const { reason } = z.object({ reason: z.string().max(2000).optional() }).parse(req.body || {});
    res.json(await changeSubscriptionStatus(req, req.params.id, action, reason));
  }));
}

router.put('/:id/notes', requirePermission('subscriptions.manage'), wrap(async (req, res) => {
  const { notes } = z.object({ notes: z.string().max(5000).nullable() }).parse(req.body);
  const before = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, req.params.id), eq(subscriptions.companyId, req.companyId)) });
  if (!before) throw notFound('Subscription');
  const [row] = await db.update(subscriptions).set({ notes, updatedAt: new Date() }).where(eq(subscriptions.id, before.id)).returning();
  await audit(req, { action: 'subscription.update_notes', entityType: 'subscription', entityId: row.id, before: { notes: before.notes }, after: { notes } });
  res.json(row);
}));

export default router;
