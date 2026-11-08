import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, or, getTableColumns } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, compact, ilike } from '../lib/util.js';

const router = Router();
const { compounds, units, vehicles, subscriptions, payments, staffCompounds, users } = schema;

const compoundSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(40).transform((s) => s.trim().toUpperCase()),
  address: z.string().max(2000).optional().nullable(),
  contactPerson: z.string().max(150).optional().nullable(),
  contactMobile: z.string().max(30).optional().nullable(),
  unitsCount: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

router.get('/', requirePermission('compounds.view'), wrap(async (req, res) => {
  const { search, status } = req.query;
  const pg = parsePagination(req.query);
  const where = and(
    eq(compounds.companyId, req.companyId),
    status ? eq(compounds.status, status) : undefined,
    search ? or(ilike(compounds.name, search), ilike(compounds.code, search), ilike(compounds.contactPerson, search)) : undefined,
  );
  const rows = await db.select({
    ...getTableColumns(compounds),
    registeredUnits: sql`(SELECT count(*) FROM units u WHERE u.compound_id = compounds.id)`.mapWith(Number),
    registeredVehicles: sql`(SELECT count(*) FROM vehicles v WHERE v.compound_id = compounds.id)`.mapWith(Number),
    activeSubscriptions: sql`(SELECT count(*) FROM subscriptions s WHERE s.compound_id = compounds.id AND s.status IN ('active','expiring_soon'))`.mapWith(Number),
  }).from(compounds).where(where).orderBy(compounds.name).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(compounds).where(where);
  res.json(paged(rows, count, pg));
}));

router.get('/:id', requirePermission('compounds.view'), wrap(async (req, res) => {
  const compound = await db.query.compounds.findFirst({ where: and(eq(compounds.id, req.params.id), eq(compounds.companyId, req.companyId)) });
  if (!compound) throw notFound('Compound');
  const [stats] = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM units WHERE compound_id = ${compound.id})::int AS units,
      (SELECT count(*) FROM vehicles WHERE compound_id = ${compound.id})::int AS vehicles,
      (SELECT count(*) FROM subscriptions WHERE compound_id = ${compound.id} AND status IN ('active','expiring_soon'))::int AS active_subscriptions,
      (SELECT count(*) FROM subscriptions WHERE compound_id = ${compound.id} AND status = 'expiring_soon')::int AS expiring_subscriptions,
      (SELECT count(*) FROM subscriptions WHERE compound_id = ${compound.id} AND status = 'expired')::int AS expired_subscriptions,
      (SELECT coalesce(sum(amount),0) FROM payments WHERE compound_id = ${compound.id} AND status = 'approved')::numeric AS revenue,
      (SELECT coalesce(sum(amount),0) FROM payments WHERE compound_id = ${compound.id} AND status IN ('pending_verification','awaiting_new_receipt'))::numeric AS outstanding,
      (SELECT count(*) FROM washing_tasks WHERE compound_id = ${compound.id} AND scheduled_date = CURRENT_DATE)::int AS washes_today,
      (SELECT count(*) FROM washing_tasks WHERE compound_id = ${compound.id} AND status = 'completed')::int AS washes_completed
  `).then((r) => r.rows || r);
  const staff = await db.select({ id: users.id, name: users.name, mobile: users.mobile, isActive: users.isActive })
    .from(staffCompounds).innerJoin(users, eq(users.id, staffCompounds.userId)).where(eq(staffCompounds.compoundId, compound.id));
  const revenueByMonth = await db.execute(sql`
    SELECT to_char(date_trunc('month', coalesce(payment_date, created_at::date)), 'YYYY-MM') AS month, sum(amount)::numeric AS revenue
    FROM payments WHERE compound_id = ${compound.id} AND status='approved' AND created_at > now() - interval '12 months'
    GROUP BY 1 ORDER BY 1`).then((r) => r.rows || r);
  res.json({ ...compound, stats, staff, revenueByMonth });
}));

router.post('/', requirePermission('compounds.manage'), wrap(async (req, res) => {
  const body = compoundSchema.parse(req.body);
  const [row] = await db.insert(compounds).values({ ...body, companyId: req.companyId }).returning();
  await audit(req, { action: 'compound.create', entityType: 'compound', entityId: row.id, after: row });
  res.status(201).json(row);
}));

router.put('/:id', requirePermission('compounds.manage'), wrap(async (req, res) => {
  const body = compoundSchema.partial().parse(req.body);
  const before = await db.query.compounds.findFirst({ where: and(eq(compounds.id, req.params.id), eq(compounds.companyId, req.companyId)) });
  if (!before) throw notFound('Compound');
  const [row] = await db.update(compounds).set({ ...compact(body), updatedAt: new Date() }).where(eq(compounds.id, before.id)).returning();
  await audit(req, { action: 'compound.update', entityType: 'compound', entityId: row.id, before, after: row });
  res.json(row);
}));

router.post('/:id/status', requirePermission('compounds.manage'), wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['active', 'inactive']) }).parse(req.body);
  const before = await db.query.compounds.findFirst({ where: and(eq(compounds.id, req.params.id), eq(compounds.companyId, req.companyId)) });
  if (!before) throw notFound('Compound');
  const [row] = await db.update(compounds).set({ status, updatedAt: new Date() }).where(eq(compounds.id, before.id)).returning();
  await audit(req, { action: `compound.${status === 'active' ? 'activate' : 'deactivate'}`, entityType: 'compound', entityId: row.id, before: { status: before.status }, after: { status } });
  res.json(row);
}));

// Assign staff to a compound (replace set)
router.put('/:id/staff', requirePermission('compounds.manage', 'staff.manage'), wrap(async (req, res) => {
  const { userIds } = z.object({ userIds: z.array(z.string().uuid()) }).parse(req.body);
  const compound = await db.query.compounds.findFirst({ where: and(eq(compounds.id, req.params.id), eq(compounds.companyId, req.companyId)) });
  if (!compound) throw notFound('Compound');
  if (userIds.length) {
    const staff = await db.select({ id: users.id }).from(users).where(and(eq(users.companyId, req.companyId), eq(users.userType, 'staff'), sql`${users.id} IN (${sql.join(userIds.map((i) => sql`${i}`), sql`, `)})`));
    if (staff.length !== userIds.length) throw badRequest('One or more users are not staff members of this company');
  }
  await db.transaction(async (t) => {
    await t.delete(staffCompounds).where(eq(staffCompounds.compoundId, compound.id));
    if (userIds.length) await t.insert(staffCompounds).values(userIds.map((userId) => ({ userId, compoundId: compound.id })));
    await audit(req, { action: 'compound.assign_staff', entityType: 'compound', entityId: compound.id, after: { userIds } }, t);
  });
  res.json({ ok: true });
}));

export default router;
