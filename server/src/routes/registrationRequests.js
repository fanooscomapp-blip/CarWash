// Admin review of self-registration requests. Approval creates owner + unit + vehicles + subscription + approved payment in one transaction, then SMS.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq, sql, desc, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, conflict, validationFailed } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, nextCode, today } from '../lib/util.js';
import { mobileCandidates, normalizeMobile } from '../lib/mobile.js';
import { sendStored } from '../lib/storage.js';
import { createSubscription } from '../services/subscriptionService.js';
import { sendSms } from '../services/smsService.js';
import { getSetting } from '../services/settingsService.js';
import { ensureRenewalToken, portalBaseUrl } from '../services/renewalLinkService.js';
import { BODY_TYPES } from '../lib/vehicleCatalog.js';

const router = Router();
const { registrationRequests, compounds, subscriptionPlans, owners, units, vehicles, qrCodes, payments, paymentReceipts, users } = schema;

const listSelect = () => ({
  id: registrationRequests.id, requestCode: registrationRequests.requestCode, ownerName: registrationRequests.ownerName, mobile: registrationRequests.mobile, unitNumber: registrationRequests.unitNumber, vehicles: registrationRequests.vehicles,
  amount: registrationRequests.amount, status: registrationRequests.status, rejectionReason: registrationRequests.rejectionReason, note: registrationRequests.note, createdAt: registrationRequests.createdAt, reviewedAt: registrationRequests.reviewedAt, resultOwnerId: registrationRequests.resultOwnerId, resultSubscriptionId: registrationRequests.resultSubscriptionId,
  compoundId: registrationRequests.compoundId, compoundName: compounds.name, planId: registrationRequests.planId, planName: subscriptionPlans.name, reviewedByName: users.name,
  existingOwnerId: sql`(SELECT o.id FROM owners o WHERE o.company_id = ${registrationRequests.companyId} AND o.mobile = ${registrationRequests.mobile} LIMIT 1)`,
});
const joined = (q) => q.from(registrationRequests).innerJoin(compounds, eq(compounds.id, registrationRequests.compoundId)).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, registrationRequests.planId)).leftJoin(users, eq(users.id, registrationRequests.reviewedBy));

router.get('/', requirePermission('payments.view', 'units.view'), wrap(async (req, res) => {
  const pg = parsePagination(req.query);
  const where = and(eq(registrationRequests.companyId, req.companyId), req.query.status ? eq(registrationRequests.status, req.query.status) : undefined, req.query.compoundId ? eq(registrationRequests.compoundId, req.query.compoundId) : undefined);
  const rows = await joined(db.select(listSelect())).where(where).orderBy(desc(registrationRequests.createdAt)).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await joined(db.select({ count: sql`count(*)`.mapWith(Number) })).where(where);
  const [counters] = await db.execute(sql`SELECT count(*) FILTER (WHERE status='pending')::int AS pending, count(*) FILTER (WHERE status='approved')::int AS approved, count(*) FILTER (WHERE status='rejected')::int AS rejected FROM registration_requests WHERE company_id = ${req.companyId}`).then((r) => r.rows || r);
  res.json({ ...paged(rows, count, pg), counters });
}));

router.get('/:id', requirePermission('payments.view', 'units.view'), wrap(async (req, res) => {
  const [row] = await joined(db.select(listSelect())).where(and(eq(registrationRequests.id, req.params.id), eq(registrationRequests.companyId, req.companyId)));
  if (!row) throw notFound('Request');
  res.json(row);
}));

router.get('/:id/receipt', requirePermission('payments.view', 'units.view'), wrap(async (req, res) => {
  const r = await db.query.registrationRequests.findFirst({ where: and(eq(registrationRequests.id, req.params.id), eq(registrationRequests.companyId, req.companyId)) });
  if (!r) throw notFound('Request');
  await sendStored(res, r.receiptPath, r.receiptMime || 'application/octet-stream');
}));

// Admin can correct data before approving (typos in plate / unit / name)
const patchSchema = z.object({
  ownerName: z.string().min(2).max(200).optional(), mobile: z.string().min(6).max(30).transform(normalizeMobile).optional(), unitNumber: z.string().min(1).max(40).transform((s) => s.trim().toUpperCase()).optional(),
  vehicles: z.array(z.object({ plateNumber: z.string().min(1).max(40).transform((s) => s.trim().toUpperCase()), brand: z.string().max(80).optional().nullable(), model: z.string().max(80).optional().nullable(), color: z.string().max(40).optional().nullable(), vehicleType: z.enum(BODY_TYPES).default('sedan'), parkingLocation: z.string().max(200).optional().nullable(), gpsLat: z.coerce.number().optional().nullable(), gpsLng: z.coerce.number().optional().nullable() })).min(1).max(5).optional(),
  planId: z.string().uuid().optional(), amount: z.coerce.number().min(0).optional(),
});
router.put('/:id', requirePermission('payments.approve', 'units.manage'), wrap(async (req, res) => {
  const body = patchSchema.parse(req.body);
  const before = await db.query.registrationRequests.findFirst({ where: and(eq(registrationRequests.id, req.params.id), eq(registrationRequests.companyId, req.companyId)) });
  if (!before) throw notFound('Request');
  if (before.status !== 'pending') throw conflict('Only pending requests can be edited');
  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (patch.amount !== undefined) patch.amount = String(patch.amount);
  const [row] = await db.update(registrationRequests).set({ ...patch, updatedAt: new Date() }).where(eq(registrationRequests.id, before.id)).returning();
  await audit(req, { action: 'registration.edit', entityType: 'registration_request', entityId: row.id, before, after: row });
  res.json(row);
}));

router.post('/:id/approve', requirePermission('payments.approve'), wrap(async (req, res) => {
  const { startDate } = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.body || {});
  const result = await db.transaction(async (t) => {
    const [r] = await t.execute(sql`SELECT * FROM registration_requests WHERE id = ${req.params.id} AND company_id = ${req.companyId} FOR UPDATE`).then((x) => x.rows || x);
    if (!r) throw notFound('Request');
    if (r.status !== 'pending') throw conflict(`Request already ${r.status}`);
    const compound = await t.query.compounds.findFirst({ where: eq(compounds.id, r.compound_id) });
    const vehicleList = r.vehicles;
    // Owner (reuse by mobile)
    let owner = await t.query.owners.findFirst({ where: and(eq(owners.companyId, req.companyId), inArray(owners.mobile, mobileCandidates(r.mobile))) });
    let createdOwner = false;
    if (!owner) { [owner] = await t.insert(owners).values({ companyId: req.companyId, name: r.owner_name, mobile: r.mobile, portalToken: crypto.randomBytes(24).toString('base64url') }).returning(); createdOwner = true; await audit(req, { action: 'owner.create', entityType: 'owner', entityId: owner.id, after: owner }, t); }
    // Unit
    let unit = await t.query.units.findFirst({ where: and(eq(units.compoundId, compound.id), eq(units.unitNumber, r.unit_number)) });
    if (unit && unit.ownerId !== owner.id) throw conflict(`Unit ${r.unit_number} belongs to another owner – edit the request first`);
    if (!unit) { [unit] = await t.insert(units).values({ companyId: req.companyId, compoundId: compound.id, ownerId: owner.id, unitNumber: r.unit_number }).returning(); await audit(req, { action: 'unit.create', entityType: 'unit', entityId: unit.id, after: unit }, t); }
    // Vehicles
    const vehicleIds = [];
    for (const v of vehicleList) {
      const dup = await t.query.vehicles.findFirst({ where: and(eq(vehicles.companyId, req.companyId), eq(vehicles.plateNumber, v.plateNumber)) });
      if (dup) throw conflict(`Plate ${v.plateNumber} is already registered (${dup.vehicleCode}) – edit the request first`);
      const vehicleCode = await nextCode(req.companyId, 'vehicle', 'VH', t);
      const [row] = await t.insert(vehicles).values({ companyId: req.companyId, vehicleCode, plateNumber: v.plateNumber, compoundId: compound.id, unitId: unit.id, ownerId: owner.id, brand: v.brand || null, model: v.model || null, color: v.color || null, vehicleType: v.vehicleType || 'sedan', parkingLocation: v.parkingLocation || null, gpsLat: v.gpsLat ?? null, gpsLng: v.gpsLng ?? null }).returning();
      await t.insert(qrCodes).values({ vehicleId: row.id, token: crypto.randomBytes(24).toString('base64url') });
      await audit(req, { action: 'vehicle.create', entityType: 'vehicle', entityId: row.id, after: row }, t);
      vehicleIds.push(row.id);
    }
    // Subscription, paid (receipt already reviewed by the admin)
    const { subscription, payment } = await createSubscription(req, { unitId: unit.id, compoundId: compound.id, vehicleIds, planId: r.plan_id, startDate: startDate || today(), price: Number(r.amount), paymentMethod: 'bank_transfer', paymentStatus: 'paid', notes: `Self-registration ${r.request_code}`, paymentNotes: r.note || null }, t);
    await t.insert(paymentReceipts).values({ paymentId: payment.id, filePath: r.receipt_path, originalName: 'registration-receipt', mimeType: r.receipt_mime, uploadedByType: 'owner' });
    await t.update(registrationRequests).set({ status: 'approved', reviewedBy: req.user.id, reviewedAt: new Date(), resultOwnerId: owner.id, resultSubscriptionId: subscription.id, updatedAt: new Date() }).where(eq(registrationRequests.id, r.id));
    await audit(req, { action: 'registration.approve', entityType: 'registration_request', entityId: r.id, after: { ownerId: owner.id, createdOwner, unitId: unit.id, vehicleIds, subscriptionId: subscription.id } }, t);
    return { owner, unit, vehicleIds, subscription, payment, plates: vehicleList.map((v) => v.plateNumber).join(', ') };
  });
  // Welcome SMS (the only SMS in the whole self-registration flow)
  try {
    const base = await portalBaseUrl(req.companyId);
    const link = `${base}/p/login`;
    const [y, m, d] = String(result.subscription.endDate).split('-');
    if ((await getSetting(req.companyId, 'notifications')).smsOnRegistrationApproved !== false) await sendSms(req.companyId, { to: result.owner.mobile, ownerId: result.owner.id, templateKey: 'registration_approved', vars: { OwnerName: result.owner.name, VehicleNumber: result.plates, ExpiryDate: `${d}/${m}/${y}`, PlanName: result.subscription.planSnapshot?.name, RenewalLink: link } });
  } catch (e) { console.error('registration_approved SMS failed', e); }
  res.json({ ok: true, ownerId: result.owner.id, subscriptionId: result.subscription.id });
}));

router.post('/:id/reject', requirePermission('payments.approve'), wrap(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(1).max(1000) }).parse(req.body);
  const r = await db.query.registrationRequests.findFirst({ where: and(eq(registrationRequests.id, req.params.id), eq(registrationRequests.companyId, req.companyId)) });
  if (!r) throw notFound('Request');
  if (r.status !== 'pending') throw conflict(`Request already ${r.status}`);
  await db.update(registrationRequests).set({ status: 'rejected', rejectionReason: reason, reviewedBy: req.user.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(registrationRequests.id, r.id));
  await audit(req, { action: 'registration.reject', entityType: 'registration_request', entityId: r.id, reason });
  res.json({ ok: true });
}));

export default router;
