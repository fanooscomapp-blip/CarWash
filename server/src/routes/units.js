import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, or, getTableColumns, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, compact, ilike } from '../lib/util.js';
import { normalizeMobile } from '../lib/mobile.js';
import { assertDeletable, deleteRow } from '../lib/safeDelete.js';

const router = Router();
const { units, owners, compounds, vehicles, subscriptions, payments, subscriptionPlans } = schema;

const unitSchema = z.object({
  compoundId: z.string().uuid(),
  unitNumber: z.string().min(1).max(40).transform((s) => s.trim()),
  ownerId: z.string().uuid().optional(),
  // Inline owner creation for the "register unit + owner" flow
  owner: z.object({ name: z.string().min(1), mobile: z.string().min(6), altMobile: z.string().optional().nullable(), email: z.string().email().optional().nullable().or(z.literal('')) }).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

const baseSelect = () => ({
  ...getTableColumns(units),
  compoundName: compounds.name, compoundCode: compounds.code,
  ownerName: owners.name, ownerMobile: owners.mobile, ownerAltMobile: owners.altMobile, ownerEmail: owners.email,
  vehiclesCount: sql`(SELECT count(*) FROM vehicles v WHERE v.unit_id = ${units.id})`.mapWith(Number),
  activeSubscriptions: sql`(SELECT count(*) FROM subscriptions s WHERE s.unit_id = ${units.id} AND s.status IN ('active','expiring_soon'))`.mapWith(Number),
});

router.get('/', requirePermission('units.view'), wrap(async (req, res) => {
  const { search, compoundId, ownerId } = req.query;
  const pg = parsePagination(req.query);
  const where = and(
    eq(units.companyId, req.companyId),
    compoundId ? eq(units.compoundId, compoundId) : undefined,
    ownerId ? eq(units.ownerId, ownerId) : undefined,
    search ? or(ilike(units.unitNumber, search), ilike(owners.name, search), ilike(owners.mobile, search), ilike(compounds.name, search)) : undefined,
  );
  const base = db.select(baseSelect()).from(units).innerJoin(compounds, eq(compounds.id, units.compoundId)).innerJoin(owners, eq(owners.id, units.ownerId)).where(where);
  const rows = await base.orderBy(compounds.name, units.unitNumber).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(units).innerJoin(compounds, eq(compounds.id, units.compoundId)).innerJoin(owners, eq(owners.id, units.ownerId)).where(where);
  res.json(paged(rows, count, pg));
}));

router.get('/:id', requirePermission('units.view'), wrap(async (req, res) => {
  const [unit] = await db.select(baseSelect()).from(units).innerJoin(compounds, eq(compounds.id, units.compoundId)).innerJoin(owners, eq(owners.id, units.ownerId))
    .where(and(eq(units.id, req.params.id), eq(units.companyId, req.companyId)));
  if (!unit) throw notFound('Unit');
  const unitVehicles = await db.select().from(vehicles).where(eq(vehicles.unitId, unit.id)).orderBy(vehicles.plateNumber);
  const subs = await db.select({ ...getTableColumns(subscriptions), planName: subscriptionPlans.name,
    plates: sql`(SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${subscriptions.id})` })
    .from(subscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId)).where(eq(subscriptions.unitId, unit.id)).orderBy(desc(subscriptions.createdAt));
  const pays = await db.select({ ...getTableColumns(payments), subscriptionCode: subscriptions.subscriptionCode })
    .from(payments).innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId)).where(eq(subscriptions.unitId, unit.id)).orderBy(desc(payments.createdAt));
  res.json({ ...unit, vehicles: unitVehicles, subscriptions: subs, payments: pays, washingHistory: [] });
}));

router.post('/', requirePermission('units.manage'), wrap(async (req, res) => {
  const body = unitSchema.parse(req.body);
  const compound = await db.query.compounds.findFirst({ where: and(eq(compounds.id, body.compoundId), eq(compounds.companyId, req.companyId)) });
  if (!compound) throw notFound('Compound');
  const row = await db.transaction(async (t) => {
    let ownerId = body.ownerId;
    if (!ownerId) {
      if (!body.owner) throw badRequest('Either ownerId or owner details are required');
      const mobile = normalizeMobile(body.owner.mobile);
      const existing = await t.query.owners.findFirst({ where: and(eq(owners.companyId, req.companyId), eq(owners.mobile, mobile)) });
      if (existing) ownerId = existing.id;
      else {
        const [o] = await t.insert(owners).values({ companyId: req.companyId, name: body.owner.name, mobile, altMobile: body.owner.altMobile || null, email: body.owner.email || null }).returning();
        await audit(req, { action: 'owner.create', entityType: 'owner', entityId: o.id, after: o }, t);
        ownerId = o.id;
      }
    } else {
      const o = await t.query.owners.findFirst({ where: and(eq(owners.id, ownerId), eq(owners.companyId, req.companyId)) });
      if (!o) throw notFound('Owner');
    }
    const [u] = await t.insert(units).values({ companyId: req.companyId, compoundId: body.compoundId, unitNumber: body.unitNumber, ownerId, notes: body.notes || null }).returning();
    await audit(req, { action: 'unit.create', entityType: 'unit', entityId: u.id, after: u }, t);
    return u;
  });
  res.status(201).json(row);
}));

router.put('/:id', requirePermission('units.manage'), wrap(async (req, res) => {
  const body = unitSchema.partial().omit({ owner: true }).parse(req.body);
  const before = await db.query.units.findFirst({ where: and(eq(units.id, req.params.id), eq(units.companyId, req.companyId)) });
  if (!before) throw notFound('Unit');
  if (body.ownerId) {
    const o = await db.query.owners.findFirst({ where: and(eq(owners.id, body.ownerId), eq(owners.companyId, req.companyId)) });
    if (!o) throw notFound('Owner');
  }
  const row = await db.transaction(async (t) => {
    const [u] = await t.update(units).set({ ...compact(body), updatedAt: new Date() }).where(eq(units.id, before.id)).returning();
    // Keep vehicles consistent when the unit moves compound/owner
    if (body.compoundId || body.ownerId) await t.update(vehicles).set(compact({ compoundId: body.compoundId, ownerId: body.ownerId })).where(eq(vehicles.unitId, u.id));
    await audit(req, { action: 'unit.update', entityType: 'unit', entityId: u.id, before, after: u }, t);
    return u;
  });
  res.json(row);
}));

router.delete('/:id', requirePermission('units.manage'), wrap(async (req, res) => {
  await assertDeletable('unit', req.params.id, [
    { table: 'vehicles', column: 'unit_id', label: 'vehicle(s)' },
    { table: 'subscriptions', column: 'unit_id', label: 'subscription(s)' }
  ]);
  const row = await deleteRow('units', req.params.id, req.companyId);
  await audit(req, { action: 'unit.delete', entityType: 'unit', entityId: row.id });
  res.json({ ok: true });
}));

export default router;
