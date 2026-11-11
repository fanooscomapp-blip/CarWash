/**
 * Public self-registration (/api/portal/join). No OTP by design: the applicant pays via InstaPay and uploads the receipt;
 * nothing is created in owners/units/vehicles until an admin approves, so a junk submission costs nothing (and no SMS is sent).
 * Protections: per-IP rate limit, one pending request per mobile, plate/unit already registered → immediate refusal, settings toggle.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { and, eq, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, validationFailed, conflict, AppError } from '../lib/errors.js';
import { getSetting } from '../services/settingsService.js';
import { normalizeMobile, mobileCandidates } from '../lib/mobile.js';
import { makeUploader, storageKey } from '../lib/uploads.js';
import { storeUpload } from '../lib/storage.js';
import { nextCode, money } from '../lib/util.js';
import { resolvePlanPrice, planAllowsCompound } from '../services/subscriptionService.js';
import { notifyAdmins } from '../services/notificationService.js';
import { systemAudit } from '../lib/audit.js';
import { BODY_TYPES, VEHICLE_BRANDS, VEHICLE_COLORS } from '../lib/vehicleCatalog.js';

const router = Router();
const { companies, compounds, subscriptionPlans, registrationRequests, owners, units, vehicles } = schema;
const receiptUpload = makeUploader('receipts', { maxMb: 10, allowPdf: true });
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests from this device, please try later' } } });

const normalizeUnit = (s) => s.trim().toUpperCase().replace(/\s+/g, ' ');
const normalizePlate = (s) => s.trim().toUpperCase().replace(/\s+/g, ' ');

// Everything the join page needs in one call: compounds, plans with prices per compound, payment details, catalog
router.get('/config', wrap(async (req, res) => {
  const company = await db.query.companies.findFirst({});
  if (!company) throw notFound('Company');
  const portal = await getSetting(company.id, 'portal');
  if (!portal.selfRegistration) throw new AppError(403, 'JOIN_DISABLED', 'Self-registration is currently closed');
  const cps = await db.select({ id: compounds.id, name: compounds.name, code: compounds.code }).from(compounds).where(and(eq(compounds.companyId, company.id), eq(compounds.status, 'active'))).orderBy(compounds.name);
  const plans = await db.query.subscriptionPlans.findMany({ where: and(eq(subscriptionPlans.companyId, company.id), eq(subscriptionPlans.isActive, true)), with: { prices: true }, orderBy: [subscriptionPlans.durationDays] });
  const payment = await getSetting(company.id, 'payment');
  res.json({
    company: { name: company.name, nameAr: company.nameAr, currency: company.currency, language: company.language, contactPhone: portal.contactPhone || '', contactWhatsapp: portal.contactWhatsapp || '' },
    compounds: cps,
    plans: plans.map((p) => ({ id: p.id, name: p.name, nameAr: p.nameAr, planType: p.planType, durationDays: p.durationDays, maxWashes: p.maxWashes, maxFrequencyPerWeek: p.maxFrequencyPerWeek, allowedDays: p.allowedDays, scope: p.scope, maxVehicles: p.maxVehicles, compoundIds: p.compoundIds || [], price: Number(p.price), overrides: p.prices.map((o) => ({ compoundId: o.compoundId, vehicleType: o.vehicleType, price: Number(o.price) })) })),
    payment: { method: payment.method, instapayAddress: payment.instapayAddress, instapayName: payment.instapayName, instapayLink: payment.instapayLink, instructions: payment.instructions, instructionsAr: payment.instructionsAr },
    catalog: { brands: VEHICLE_BRANDS, bodyTypes: BODY_TYPES, colors: VEHICLE_COLORS },
  });
}));

const vehicleRow = z.object({ plateNumber: z.string().min(1).max(40).transform(normalizePlate), brand: z.string().max(80).optional().nullable(), model: z.string().max(80).optional().nullable(), color: z.string().max(40).optional().nullable(), vehicleType: z.enum(BODY_TYPES).default('sedan'), parkingLocation: z.string().max(200).optional().nullable(), gpsLat: z.coerce.number().min(-90).max(90).optional().nullable(), gpsLng: z.coerce.number().min(-180).max(180).optional().nullable() });
const joinSchema = z.object({
  compoundId: z.string().uuid(), ownerName: z.string().min(2).max(200), mobile: z.string().min(6).max(30).transform(normalizeMobile), unitNumber: z.string().min(1).max(40).transform(normalizeUnit),
  vehicles: z.preprocess((v) => (typeof v === 'string' ? JSON.parse(v) : v), z.array(vehicleRow).min(1).max(5)),
  planId: z.string().uuid(), note: z.string().max(500).optional(),
});

router.post('/', limiter, receiptUpload.single('receipt'), wrap(async (req, res) => {
  try {
    const body = joinSchema.parse(req.body);
    if (!req.file) throw validationFailed('Please attach the transfer screenshot');
    const compound = await db.query.compounds.findFirst({ where: and(eq(compounds.id, body.compoundId), eq(compounds.status, 'active')) });
    if (!compound) throw notFound('Compound');
    const companyId = compound.companyId;
    const portal = await getSetting(companyId, 'portal');
    if (!portal.selfRegistration) throw new AppError(403, 'JOIN_DISABLED', 'Self-registration is currently closed');
    // Per-IP hourly cap from settings (on top of the express-rate-limit guard)
    const [{ n }] = await db.execute(sql`SELECT count(*)::int AS n FROM registration_requests WHERE ip = ${req.ip} AND created_at > now() - interval '1 hour'`).then((r) => r.rows || r);
    if (n >= (portal.joinMaxPerHour || 5)) throw new AppError(429, 'RATE_LIMITED', 'Too many requests from this device, please try later');

    const plates = body.vehicles.map((v) => v.plateNumber);
    if (new Set(plates).size !== plates.length) throw validationFailed('The same plate appears twice');
    const plan = await db.query.subscriptionPlans.findFirst({ where: and(eq(subscriptionPlans.id, body.planId), eq(subscriptionPlans.companyId, companyId), eq(subscriptionPlans.isActive, true)) });
    if (!plan) throw notFound('Plan');
    if (body.vehicles.length > plan.maxVehicles || (plan.scope === 'per_vehicle' && body.vehicles.length > 1)) throw validationFailed('This plan does not cover that many vehicles');
    if (!planAllowsCompound(plan, body.compoundId)) throw validationFailed('This plan is not offered in the selected compound');

    // Refuse what would be refused at approval time, so the applicant learns immediately
    const existingPlates = await db.select({ plateNumber: vehicles.plateNumber }).from(vehicles).where(and(eq(vehicles.companyId, companyId), inArray(vehicles.plateNumber, plates)));
    if (existingPlates.length) throw conflict(`Plate ${existingPlates[0].plateNumber} is already registered. If this is your car, sign in or contact the administration.`);
    const unit = await db.query.units.findFirst({ where: and(eq(units.compoundId, compound.id), eq(units.unitNumber, body.unitNumber)) });
    if (unit) {
      const owner = await db.query.owners.findFirst({ where: eq(owners.id, unit.ownerId) });
      if (!mobileCandidates(body.mobile).includes(owner?.mobile)) throw conflict(`Unit ${body.unitNumber} is already registered to another resident. Please contact the administration.`);
    }
    const pending = await db.query.registrationRequests.findFirst({ where: and(eq(registrationRequests.companyId, companyId), inArray(registrationRequests.mobile, mobileCandidates(body.mobile)), eq(registrationRequests.status, 'pending')) });
    if (pending) throw conflict(`You already have a pending request (${pending.requestCode}). We will contact you once it is reviewed.`, { requestCode: pending.requestCode, statusToken: pending.statusToken });

    const { price } = await resolvePlanPrice(plan.id, compound.id, body.vehicles[0].vehicleType);
    const receiptPath = await storeUpload(req.file.path, storageKey('receipts', req.file), req.file.mimetype);
    const requestCode = await nextCode(companyId, 'joinreq', 'REG');
    const statusToken = crypto.randomBytes(18).toString('base64url');
    const [row] = await db.insert(registrationRequests).values({ companyId, requestCode, compoundId: compound.id, ownerName: body.ownerName.trim(), mobile: body.mobile, unitNumber: body.unitNumber, vehicles: body.vehicles, planId: plan.id, amount: String(money(price)), receiptPath, receiptMime: req.file.mimetype, note: body.note || null, statusToken, ip: req.ip }).returning();
    await notifyAdmins(companyId, { type: 'registration.pending', title: `New registration ${requestCode} – ${body.ownerName}`, body: `${compound.name} · ${t2(body.unitNumber)} · ${plates.join(', ')} · ${money(price)}`, entityType: 'registration_request', entityId: row.id });
    await systemAudit(companyId, { action: 'portal.join_submitted', entityType: 'registration_request', entityId: row.id, after: { mobile: body.mobile, compound: compound.name, plates } });
    res.status(201).json({ requestCode, statusToken, amount: money(price), status: 'pending' });
  } catch (e) { if (req.file) fs.unlink(req.file.path, () => {}); throw e; }
}));
const t2 = (u) => `Unit ${u}`;

// Applicant checks status with the token from the confirmation screen (also stored in the browser)
router.get('/status/:token', wrap(async (req, res) => {
  const r = await db.query.registrationRequests.findFirst({ where: eq(registrationRequests.statusToken, req.params.token) });
  if (!r) throw notFound('Request');
  const compound = await db.query.compounds.findFirst({ where: eq(compounds.id, r.compoundId) });
  const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, r.planId) });
  let renewalLink = null;
  if (r.status === 'approved' && r.resultSubscriptionId) { const { ensureRenewalToken } = await import('../services/renewalLinkService.js'); renewalLink = `/p/renew/${await ensureRenewalToken(r.resultSubscriptionId)}`; }
  res.json({ requestCode: r.requestCode, status: r.status, rejectionReason: r.rejectionReason, ownerName: r.ownerName, mobile: r.mobile, compound: compound?.name, unitNumber: r.unitNumber, vehicles: r.vehicles, planName: plan?.name, planNameAr: plan?.nameAr, amount: Number(r.amount), createdAt: r.createdAt, reviewedAt: r.reviewedAt, renewalLink });
}));

export default router;
