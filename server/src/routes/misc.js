import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, or, getTableColumns, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, paged, ilike } from '../lib/util.js';
import { listNotifications, markRead } from '../services/notificationService.js';
import { VEHICLE_TYPES } from './vehicles.js';
import { PLAN_TYPES } from './plans.js';
import { SUB_STATUS } from '../services/subscriptionService.js';

export const auditRouter = Router();
const { auditLogs, users, compounds, owners, units } = schema;

auditRouter.get('/', requirePermission('audit.view'), wrap(async (req, res) => {
  const { search, action, entityType, userId, dateFrom, dateTo } = req.query;
  const pg = parsePagination(req.query, { page: 1, pageSize: 50 });
  const where = and(eq(auditLogs.companyId, req.companyId),
    action ? ilike(auditLogs.action, action) : undefined,
    entityType ? eq(auditLogs.entityType, entityType) : undefined,
    userId ? eq(auditLogs.userId, userId) : undefined,
    dateFrom ? sql`${auditLogs.createdAt} >= ${dateFrom}::date` : undefined,
    dateTo ? sql`${auditLogs.createdAt} < (${dateTo}::date + 1)` : undefined,
    search ? or(ilike(auditLogs.action, search), ilike(auditLogs.entityType, search), ilike(users.name, search), sql`${auditLogs.entityId}::text ILIKE ${'%' + search + '%'}`) : undefined);
  const rows = await db.select({ ...getTableColumns(auditLogs), userName: users.name, userEmail: users.email }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId))
    .where(where).orderBy(desc(auditLogs.createdAt)).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId)).where(where);
  const actions = await db.execute(sql`SELECT DISTINCT action FROM audit_logs WHERE company_id = ${req.companyId} ORDER BY 1`).then((r) => (r.rows || r).map((x) => x.action));
  res.json({ ...paged(rows, count, pg), actions });
}));

export const notificationsRouter = Router();
notificationsRouter.get('/', wrap(async (req, res) => {
  const rows = await listNotifications(req.companyId, req.user, { unreadOnly: req.query.unread === 'true', limit: Number(req.query.limit) || 30 });
  res.json({ data: rows, unread: rows.filter((n) => !n.isRead).length });
}));
notificationsRouter.post('/read', wrap(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);
  await markRead(req.companyId, ids);
  res.json({ ok: true });
}));

// Lightweight lookups for form selects
export const lookupsRouter = Router();
lookupsRouter.get('/', wrap(async (req, res) => {
  const cid = req.companyId;
  const [compoundRows, staffRows] = await Promise.all([
    db.select({ id: compounds.id, name: compounds.name, code: compounds.code, status: compounds.status }).from(compounds).where(eq(compounds.companyId, cid)).orderBy(compounds.name),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.companyId, cid), eq(users.userType, 'staff'), eq(users.isActive, true))).orderBy(users.name),
  ]);
  res.json({ compounds: compoundRows, staff: staffRows, vehicleTypes: VEHICLE_TYPES, planTypes: Object.keys(PLAN_TYPES), subscriptionStatuses: SUB_STATUS, paymentMethods: ['bank_transfer', 'cash', 'other'] });
}));

// Typeahead: owners / units / vehicles by free text, scoped by compound when given
lookupsRouter.get('/search', wrap(async (req, res) => {
  const { q = '', compoundId, type = 'units' } = req.query;
  if (type === 'owners') {
    const rows = await db.select({ id: owners.id, name: owners.name, mobile: owners.mobile }).from(owners)
      .where(and(eq(owners.companyId, req.companyId), q ? or(ilike(owners.name, q), ilike(owners.mobile, q)) : undefined)).orderBy(owners.name).limit(20);
    return res.json(rows);
  }
  const rows = await db.select({ id: units.id, unitNumber: units.unitNumber, compoundId: units.compoundId, compoundName: compounds.name, ownerId: owners.id, ownerName: owners.name, ownerMobile: owners.mobile })
    .from(units).innerJoin(compounds, eq(compounds.id, units.compoundId)).innerJoin(owners, eq(owners.id, units.ownerId))
    .where(and(eq(units.companyId, req.companyId), compoundId ? eq(units.compoundId, compoundId) : undefined, q ? or(ilike(units.unitNumber, q), ilike(owners.name, q), ilike(owners.mobile, q)) : undefined))
    .orderBy(compounds.name, units.unitNumber).limit(20);
  res.json(rows);
}));
