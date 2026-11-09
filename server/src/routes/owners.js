import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, or, getTableColumns, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, compact, ilike } from '../lib/util.js';
import { normalizeMobile } from '../lib/mobile.js';

const router = Router();
const { owners, units, vehicles, subscriptions, payments, compounds, subscriptionPlans } = schema;

const ownerSchema = z.object({
  name: z.string().min(1).max(200),
  mobile: z.string().min(6).max(30).transform(normalizeMobile),
  altMobile: z.string().max(30).optional().nullable().transform((s) => (s ? normalizeMobile(s) : s)),
  email: z.string().email().optional().nullable().or(z.literal('')).transform((s) => s || null),
  notes: z.string().max(5000).optional().nullable(),
});

router.get('/', requirePermission('owners.view'), wrap(async (req, res) => {
  const { search, compoundId } = req.query;
  const pg = parsePagination(req.query);
  const where = and(
    eq(owners.companyId, req.companyId),
    search ? or(ilike(owners.name, search), ilike(owners.mobile, search), ilike(owners.email, search)) : undefined,
    compoundId ? sql`EXISTS (SELECT 1 FROM units u WHERE u.owner_id = owners.id AND u.compound_id = ${compoundId})` : undefined,
  );
  const rows = await db.select({
    ...getTableColumns(owners),
    unitsCount: sql`(SELECT count(*) FROM units u WHERE u.owner_id = owners.id)`.mapWith(Number),
    vehiclesCount: sql`(SELECT count(*) FROM vehicles v WHERE v.owner_id = owners.id)`.mapWith(Number),
    activeSubscriptions: sql`(SELECT count(*) FROM subscriptions s WHERE s.owner_id = owners.id AND s.status IN ('active','expiring_soon'))`.mapWith(Number),
    compoundNames: sql`(SELECT string_agg(DISTINCT c.name, ', ') FROM units u JOIN compounds c ON c.id = u.compound_id WHERE u.owner_id = owners.id)`,
  }).from(owners).where(where).orderBy(owners.name).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(owners).where(where);
  res.json(paged(rows, count, pg));
}));

router.get('/:id', requirePermission('owners.view'), wrap(async (req, res) => {
  const owner = await db.query.owners.findFirst({ where: and(eq(owners.id, req.params.id), eq(owners.companyId, req.companyId)) });
  if (!owner) throw notFound('Owner');
  const ownerUnits = await db.select({ ...getTableColumns(units), compoundName: compounds.name, compoundCode: compounds.code })
    .from(units).innerJoin(compounds, eq(compounds.id, units.compoundId)).where(eq(units.ownerId, owner.id)).orderBy(compounds.name, units.unitNumber);
  const ownerVehicles = await db.select({ ...getTableColumns(vehicles), unitNumber: units.unitNumber, compoundName: compounds.name })
    .from(vehicles).innerJoin(units, eq(units.id, vehicles.unitId)).innerJoin(compounds, eq(compounds.id, vehicles.compoundId))
    .where(eq(vehicles.ownerId, owner.id)).orderBy(vehicles.plateNumber);
  const subs = await db.select({ ...getTableColumns(subscriptions), planName: subscriptionPlans.name, unitNumber: units.unitNumber, compoundName: compounds.name,
    plates: sql`(SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${subscriptions.id})` })
    .from(subscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId)).innerJoin(units, eq(units.id, subscriptions.unitId)).innerJoin(compounds, eq(compounds.id, subscriptions.compoundId))
    .where(eq(subscriptions.ownerId, owner.id)).orderBy(desc(subscriptions.createdAt));
  const pays = await db.select({ ...getTableColumns(payments), subscriptionCode: subscriptions.subscriptionCode })
    .from(payments).innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId)).where(eq(payments.ownerId, owner.id)).orderBy(desc(payments.createdAt));
  res.json({ ...owner, units: ownerUnits, vehicles: ownerVehicles, subscriptions: subs, payments: pays, washingHistory: [] });
}));

router.post('/', requirePermission('owners.manage'), wrap(async (req, res) => {
  const body = ownerSchema.parse(req.body);
  const [row] = await db.insert(owners).values({ ...body, companyId: req.companyId }).returning();
  await audit(req, { action: 'owner.create', entityType: 'owner', entityId: row.id, after: row });
  res.status(201).json(row);
}));

router.put('/:id', requirePermission('owners.manage'), wrap(async (req, res) => {
  const body = ownerSchema.partial().parse(req.body);
  const before = await db.query.owners.findFirst({ where: and(eq(owners.id, req.params.id), eq(owners.companyId, req.companyId)) });
  if (!before) throw notFound('Owner');
  const [row] = await db.update(owners).set({ ...compact(body), updatedAt: new Date() }).where(eq(owners.id, before.id)).returning();
  await audit(req, { action: 'owner.update', entityType: 'owner', entityId: row.id, before, after: row });
  res.json(row);
}));

export default router;
