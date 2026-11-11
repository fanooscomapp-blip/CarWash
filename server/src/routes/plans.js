import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, getTableColumns } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, validationFailed } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { compact } from '../lib/util.js';
import { resolvePlanPrice, planAllowsCompound } from '../services/subscriptionService.js';
import { assertDeletable, deleteRow } from '../lib/safeDelete.js';

const router = Router();
const { subscriptionPlans, planPrices } = schema;

export const PLAN_TYPES = { weekly: 7, monthly: 30, quarterly: 90, semi_annual: 180, annual: 365, custom: null };

const priceSchema = z.object({ compoundId: z.string().uuid().nullable().optional(), vehicleType: z.string().max(30).nullable().optional(), price: z.coerce.number().min(0) });
const planSchema = z.object({
  name: z.string().min(1).max(150),
  nameAr: z.string().max(150).optional().nullable(),
  planType: z.enum(Object.keys(PLAN_TYPES)),
  durationDays: z.coerce.number().int().min(1).optional(),
  price: z.coerce.number().min(0),
  allowedDays: z.array(z.number().int().min(0).max(6)).min(1),
  maxFrequencyPerWeek: z.coerce.number().int().min(1).max(7),
  maxWashes: z.coerce.number().int().min(1),
  scope: z.enum(['per_vehicle', 'per_unit', 'multi_vehicle']),
  maxVehicles: z.coerce.number().int().min(1).optional(),
  compoundIds: z.array(z.string().uuid()).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  prices: z.array(priceSchema).optional(),
});
const customNeedsDuration = (v) => { if (v.planType === 'custom' && !v.durationDays) throw validationFailed('Duration is required for custom plans'); };

router.get('/', requirePermission('plans.view', 'subscriptions.view'), wrap(async (req, res) => {
  const { active, compoundId } = req.query;
  const rows0 = await db.query.subscriptionPlans.findMany({
    where: and(eq(subscriptionPlans.companyId, req.companyId), active === 'true' ? eq(subscriptionPlans.isActive, true) : undefined),
    with: { prices: { with: { compound: { columns: { id: true, name: true } } } } },
    orderBy: [subscriptionPlans.durationDays, subscriptionPlans.name],
  });
  const rows = compoundId ? rows0.filter((p) => planAllowsCompound(p, String(compoundId))) : rows0;
  const usage = await db.execute(sql`SELECT plan_id, count(*)::int AS total, count(*) FILTER (WHERE status IN ('active','expiring_soon'))::int AS active FROM subscriptions WHERE company_id = ${req.companyId} GROUP BY plan_id`).then((r) => r.rows || r);
  res.json(rows.map((p) => ({ ...p, usage: usage.find((u) => u.plan_id === p.id) || { total: 0, active: 0 } })));
}));

// Quote: resolved price for plan+compound+vehicleType (used by subscription/renewal forms)
router.get('/:id/quote', requirePermission('subscriptions.view'), wrap(async (req, res) => {
  const { compoundId, vehicleType } = req.query;
  const { plan, price, overrideApplied } = await resolvePlanPrice(req.params.id, compoundId || null, vehicleType || null);
  if (plan.companyId !== req.companyId) throw notFound('Subscription plan');
  res.json({ planId: plan.id, price, basePrice: Number(plan.price), overrideApplied, durationDays: plan.durationDays, maxWashes: plan.maxWashes, allowedDays: plan.allowedDays, maxFrequencyPerWeek: plan.maxFrequencyPerWeek, scope: plan.scope, maxVehicles: plan.maxVehicles });
}));

async function savePrices(t, planId, prices) {
  await t.delete(planPrices).where(eq(planPrices.planId, planId));
  if (prices?.length) await t.insert(planPrices).values(prices.map((p) => ({ planId, compoundId: p.compoundId || null, vehicleType: p.vehicleType || null, price: String(p.price) })));
}

router.post('/', requirePermission('plans.manage'), wrap(async (req, res) => {
  const { prices, ...body } = planSchema.parse(req.body); customNeedsDuration(body);
  const durationDays = body.planType === 'custom' ? body.durationDays : (body.durationDays || PLAN_TYPES[body.planType]);
  const row = await db.transaction(async (t) => {
    const [p] = await t.insert(subscriptionPlans).values({ ...body, durationDays, price: String(body.price), maxVehicles: body.scope === 'per_vehicle' ? 1 : (body.maxVehicles || 1), companyId: req.companyId }).returning();
    await savePrices(t, p.id, prices);
    await audit(req, { action: 'plan.create', entityType: 'plan', entityId: p.id, after: { ...p, prices } }, t);
    return p;
  });
  res.status(201).json(row);
}));

router.put('/:id', requirePermission('plans.manage'), wrap(async (req, res) => {
  const { prices, ...body } = planSchema.partial().parse(req.body);
  const before = await db.query.subscriptionPlans.findFirst({ where: and(eq(subscriptionPlans.id, req.params.id), eq(subscriptionPlans.companyId, req.companyId)) });
  if (!before) throw notFound('Subscription plan');
  const patch = compact({ ...body, price: body.price !== undefined ? String(body.price) : undefined });
  const row = await db.transaction(async (t) => {
    const [p] = await t.update(subscriptionPlans).set({ ...patch, updatedAt: new Date() }).where(eq(subscriptionPlans.id, before.id)).returning();
    if (prices) await savePrices(t, p.id, prices);
    await audit(req, { action: 'plan.update', entityType: 'plan', entityId: p.id, before, after: { ...p, prices } }, t);
    return p;
  });
  res.json(row);
}));

router.delete('/:id', requirePermission('plans.manage'), wrap(async (req, res) => {
  await assertDeletable('plan', req.params.id, [
    { table: 'subscriptions', column: 'plan_id', label: 'subscription(s)' },
    { table: 'registration_requests', column: 'plan_id', label: 'registration request(s)', where: "status = 'pending'" }
  ]);
  const row = await deleteRow('subscription_plans', req.params.id, req.companyId);
  await audit(req, { action: 'plan.delete', entityType: 'plan', entityId: row.id });
  res.json({ ok: true });
}));

export default router;
