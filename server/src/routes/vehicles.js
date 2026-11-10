import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import { and, eq, sql, or, getTableColumns, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, compact, ilike, nextCode } from '../lib/util.js';
import { makeUploader, storageKey } from '../lib/uploads.js';
import { storeUpload, sendStored } from '../lib/storage.js';
import { refreshStatuses } from '../services/subscriptionService.js';

const router = Router();
const { vehicles, units, owners, compounds, subscriptions, subscriptionPlans, qrCodes, subscriptionVehicles } = schema;
const photoUpload = makeUploader('vehicles', { maxMb: 8 });

import { BODY_TYPES } from '../lib/vehicleCatalog.js';
import { assertDeletable, deleteRow } from '../lib/safeDelete.js';
export const VEHICLE_TYPES = BODY_TYPES;

const vehicleSchema = z.object({
  unitId: z.string().uuid(),
  plateNumber: z.string().min(1).max(40).transform((s) => s.trim().toUpperCase().replace(/\s+/g, ' ')),
  brand: z.string().max(80).optional().nullable(),
  model: z.string().max(80).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  registrationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  parkingLocation: z.string().max(200).optional().nullable(),
  gpsLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  gpsLng: z.coerce.number().min(-180).max(180).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

// Latest non-cancelled subscription for the vehicle (by end date) – what the UI shows as "current subscription"
const currentSubSql = (col) => sql`(SELECT ${sql.raw(col)} FROM subscriptions s JOIN subscription_vehicles sv ON sv.subscription_id = s.id
  WHERE sv.vehicle_id = ${vehicles.id} AND s.status <> 'cancelled' ORDER BY s.end_date DESC LIMIT 1)`;

const baseSelect = () => ({
  ...getTableColumns(vehicles),
  unitNumber: units.unitNumber, compoundName: compounds.name, ownerName: owners.name, ownerMobile: owners.mobile,
  currentSubscriptionId: currentSubSql('s.id'),
  currentSubscriptionStatus: currentSubSql('s.status'),
  currentSubscriptionEnd: currentSubSql('s.end_date::text'),
  currentSubscriptionPlan: currentSubSql('s.plan_snapshot->>\'name\''),
  currentWashesRemaining: currentSubSql('s.washes_allowed - s.washes_used').mapWith(Number),
});

router.get('/', requirePermission('vehicles.view'), wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const { search, compoundId, unitId, ownerId, status, subscriptionStatus, vehicleType } = req.query;
  const pg = parsePagination(req.query);
  const where = and(
    eq(vehicles.companyId, req.companyId),
    compoundId ? eq(vehicles.compoundId, compoundId) : undefined,
    unitId ? eq(vehicles.unitId, unitId) : undefined,
    ownerId ? eq(vehicles.ownerId, ownerId) : undefined,
    status ? eq(vehicles.status, status) : undefined,
    vehicleType ? eq(vehicles.vehicleType, vehicleType) : undefined,
    subscriptionStatus === 'none' ? sql`${currentSubSql('s.id')} IS NULL` : subscriptionStatus ? sql`${currentSubSql('s.status')} = ${subscriptionStatus}` : undefined,
    search ? or(ilike(vehicles.plateNumber, search), ilike(vehicles.vehicleCode, search), ilike(vehicles.brand, search), ilike(vehicles.model, search), ilike(owners.name, search), ilike(owners.mobile, search), ilike(units.unitNumber, search)) : undefined,
  );
  const from = (q) => q.from(vehicles).innerJoin(units, eq(units.id, vehicles.unitId)).innerJoin(compounds, eq(compounds.id, vehicles.compoundId)).innerJoin(owners, eq(owners.id, vehicles.ownerId)).where(where);
  const rows = await from(db.select(baseSelect())).orderBy(desc(vehicles.createdAt)).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await from(db.select({ count: sql`count(*)`.mapWith(Number) }));
  res.json(paged(rows, count, pg));
}));

router.get('/:id', requirePermission('vehicles.view'), wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const [vehicle] = await db.select(baseSelect()).from(vehicles).innerJoin(units, eq(units.id, vehicles.unitId)).innerJoin(compounds, eq(compounds.id, vehicles.compoundId)).innerJoin(owners, eq(owners.id, vehicles.ownerId))
    .where(and(eq(vehicles.id, req.params.id), eq(vehicles.companyId, req.companyId)));
  if (!vehicle) throw notFound('Vehicle');
  const subs = await db.select({ ...getTableColumns(subscriptions), planName: subscriptionPlans.name })
    .from(subscriptionVehicles).innerJoin(subscriptions, eq(subscriptions.id, subscriptionVehicles.subscriptionId)).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(eq(subscriptionVehicles.vehicleId, vehicle.id)).orderBy(desc(subscriptions.startDate));
  const qr = await db.query.qrCodes.findFirst({ where: eq(qrCodes.vehicleId, vehicle.id) });
  res.json({ ...vehicle, subscriptions: subs, qrToken: qr?.token || null, washingHistory: [] });
}));

router.post('/', requirePermission('vehicles.manage'), wrap(async (req, res) => {
  const body = vehicleSchema.parse(req.body);
  const unit = await db.query.units.findFirst({ where: and(eq(units.id, body.unitId), eq(units.companyId, req.companyId)) });
  if (!unit) throw notFound('Unit');
  const row = await db.transaction(async (t) => {
    const vehicleCode = await nextCode(req.companyId, 'vehicle', 'VH', t);
    const [v] = await t.insert(vehicles).values({ ...body, vehicleCode, companyId: req.companyId, compoundId: unit.compoundId, ownerId: unit.ownerId, registrationDate: body.registrationDate || undefined }).returning();
    await t.insert(qrCodes).values({ vehicleId: v.id, token: crypto.randomBytes(24).toString('base64url') });
    await audit(req, { action: 'vehicle.create', entityType: 'vehicle', entityId: v.id, after: v }, t);
    return v;
  });
  res.status(201).json(row);
}));

router.put('/:id', requirePermission('vehicles.manage'), wrap(async (req, res) => {
  const body = vehicleSchema.partial().parse(req.body);
  const before = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, req.params.id), eq(vehicles.companyId, req.companyId)) });
  if (!before) throw notFound('Vehicle');
  const patch = compact(body);
  if (body.unitId && body.unitId !== before.unitId) {
    const unit = await db.query.units.findFirst({ where: and(eq(units.id, body.unitId), eq(units.companyId, req.companyId)) });
    if (!unit) throw notFound('Unit');
    patch.compoundId = unit.compoundId; patch.ownerId = unit.ownerId;
  }
  const [row] = await db.update(vehicles).set({ ...patch, updatedAt: new Date() }).where(eq(vehicles.id, before.id)).returning();
  await audit(req, { action: 'vehicle.update', entityType: 'vehicle', entityId: row.id, before, after: row });
  res.json(row);
}));

router.post('/:id/photo', requirePermission('vehicles.manage'), photoUpload.single('photo'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('No photo uploaded');
  const before = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, req.params.id), eq(vehicles.companyId, req.companyId)) });
  if (!before) { fs.unlink(req.file.path, () => {}); throw notFound('Vehicle'); }
  const photoPath = await storeUpload(req.file.path, storageKey('vehicles', req.file), req.file.mimetype);
  const [row] = await db.update(vehicles).set({ photoPath, updatedAt: new Date() }).where(eq(vehicles.id, before.id)).returning();
  await audit(req, { action: 'vehicle.photo', entityType: 'vehicle', entityId: row.id, before: { photoPath: before.photoPath }, after: { photoPath } });
  res.json(row);
}));

router.get('/:id/photo', requirePermission('vehicles.view'), wrap(async (req, res) => {
  const v = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, req.params.id), eq(vehicles.companyId, req.companyId)) });
  if (!v?.photoPath) throw notFound('Photo');
  await sendStored(res, v.photoPath);
}));

router.delete('/:id', requirePermission('vehicles.manage'), wrap(async (req, res) => {
  await assertDeletable('vehicle', req.params.id, [
    { table: 'subscription_vehicles', column: 'vehicle_id', label: 'subscription link(s)' },
    { table: 'washing_tasks', column: 'vehicle_id', label: 'washing task(s)' }
  ]);
  const row = await deleteRow('vehicles', req.params.id, req.companyId);
  await audit(req, { action: 'vehicle.delete', entityType: 'vehicle', entityId: row.id });
  res.json({ ok: true });
}));

export default router;
