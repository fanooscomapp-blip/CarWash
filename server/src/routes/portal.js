/**
 * Owner portal API (/api/portal). Two access modes:
 *  1. Renewal link: /renew/:token – scoped to ONE subscription, no login. Shows the plan/amount/InstaPay details, accepts the receipt.
 *  2. Owner session: OTP → bearer token – full read access to the owner's own units, vehicles, subscriptions, washes, requests.
 * Owners never see other owners' data: every query is filtered by owner_id from the session, or by the subscription behind the token.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { and, eq, sql, desc, gt, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, badRequest, unauthorized, validationFailed, conflict, AppError } from '../lib/errors.js';
import { getSetting } from '../services/settingsService.js';
import { sendSms } from '../services/smsService.js';
import { normalizeMobile, mobileCandidates } from '../lib/mobile.js';
import { makeUploader, storageKey } from '../lib/uploads.js';
import { storeUpload, sendStored } from '../lib/storage.js';
import { nextCode, today, addDays, money } from '../lib/util.js';
import { refreshStatuses, resolvePlanPrice, createSubscription } from '../services/subscriptionService.js';
import { notifyAdmins } from '../services/notificationService.js';
import { systemAudit } from '../lib/audit.js';

const router = Router();
const { owners, units, vehicles, subscriptions, subscriptionVehicles, subscriptionPlans, payments, paymentReceipts, subscriptionRenewals, otpCodes, ownerSessions, companies, washingTasks, washingOperations, washPhotos, compounds, users } = schema;
const receiptUpload = makeUploader('receipts', { maxMb: 10, allowPdf: true });
const limiter = (limit, windowMin) => rateLimit({ windowMs: windowMin * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, please wait and try again' } } });

const publicCompany = async (companyId) => {
  const c = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  return c ? { id: c.id, name: c.name, nameAr: c.nameAr, currency: c.currency, language: c.language } : null;
};
const fmtPlan = (p, lang) => ({ id: p.id, name: p.name, nameAr: p.nameAr, planType: p.planType, durationDays: p.durationDays, maxWashes: p.maxWashes, allowedDays: p.allowedDays, maxFrequencyPerWeek: p.maxFrequencyPerWeek, scope: p.scope, maxVehicles: p.maxVehicles, description: p.description });

// ───────────────────────── Public config ─────────────────────────
router.get('/config', wrap(async (_req, res) => {
  const c = await db.query.companies.findFirst({});
  res.json(c ? { name: c.name, nameAr: c.nameAr, currency: c.currency, language: c.language } : {});
}));

// ───────────────────────── 1. Renewal by secure link ─────────────────────────
async function subscriptionByToken(token) {
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.renewalToken, token) });
  if (!sub) throw new AppError(404, 'LINK_INVALID', 'This link is not valid');
  if (!sub.renewalTokenExpiresAt || sub.renewalTokenExpiresAt < new Date()) throw new AppError(410, 'LINK_EXPIRED', 'This link has expired. Please ask for a new one.');
  return sub;
}

async function renewalSummary(sub, lang) {
  await refreshStatuses(sub.companyId);
  const [fresh] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
  const owner = await db.query.owners.findFirst({ where: eq(owners.id, fresh.ownerId) });
  const unit = await db.query.units.findFirst({ where: eq(units.id, fresh.unitId), with: { compound: true } });
  const vehicleRows = await db.select({ id: vehicles.id, plateNumber: vehicles.plateNumber, brand: vehicles.brand, model: vehicles.model, color: vehicles.color, vehicleType: vehicles.vehicleType })
    .from(subscriptionVehicles).innerJoin(vehicles, eq(vehicles.id, subscriptionVehicles.vehicleId)).where(eq(subscriptionVehicles.subscriptionId, fresh.id));
  const plans = await db.query.subscriptionPlans.findMany({ where: and(eq(subscriptionPlans.companyId, fresh.companyId), eq(subscriptionPlans.isActive, true)), orderBy: [subscriptionPlans.durationDays] });
  const eligible = plans.filter((p) => vehicleRows.length <= p.maxVehicles && (p.scope !== 'per_vehicle' || vehicleRows.length === 1));
  const priced = [];
  for (const p of eligible) { const { price } = await resolvePlanPrice(p.id, fresh.compoundId, vehicleRows[0]?.vehicleType); priced.push({ ...fmtPlan(p, lang), price, isCurrent: p.id === fresh.planId }); }
  // Existing renewal (pending / rejected) created from this subscription
  const renewal = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.renewedFromId, fresh.id), sql`${subscriptions.status} <> 'cancelled'`), orderBy: [desc(subscriptions.createdAt)] });
  let request = null;
  if (renewal) {
    const payment = await db.query.payments.findFirst({ where: eq(payments.subscriptionId, renewal.id), with: { receipts: true }, orderBy: [desc(payments.createdAt)] });
    request = { subscriptionId: renewal.id, code: renewal.subscriptionCode, planName: renewal.planSnapshot?.name, planNameAr: renewal.planSnapshot?.nameAr, startDate: renewal.startDate, endDate: renewal.endDate, amount: Number(renewal.finalAmount), status: renewal.status,
      payment: payment ? { id: payment.id, code: payment.paymentCode, status: payment.status, rejectionReason: payment.rejectionReason, receipts: payment.receipts.map((r) => ({ id: r.id, originalName: r.originalName, uploadedAt: r.uploadedAt })) } : null };
  }
  const payment = await getSetting(fresh.companyId, 'payment');
  const company = await publicCompany(fresh.companyId);
  return {
    company, owner: { name: owner.name, mobileMasked: owner.mobile.replace(/^(\+?\d{4})\d+(\d{3})$/, '$1•••••$2') },
    compound: unit.compound.name, unitNumber: unit.unitNumber, vehicles: vehicleRows,
    current: { id: fresh.id, code: fresh.subscriptionCode, planName: fresh.planSnapshot?.name, planNameAr: fresh.planSnapshot?.nameAr, startDate: fresh.startDate, endDate: fresh.endDate, status: fresh.status, washesAllowed: fresh.washesAllowed, washesUsed: fresh.washesUsed, daysRemaining: Math.round((new Date(fresh.endDate) - new Date(today())) / 86400000) },
    plans: priced, payment: { method: payment.method, instapayAddress: payment.instapayAddress, instapayName: payment.instapayName, instructions: payment.instructions, instructionsAr: payment.instructionsAr },
    request,
  };
}

router.get('/renew/:token', limiter(60, 15), wrap(async (req, res) => {
  const sub = await subscriptionByToken(req.params.token);
  res.json(await renewalSummary(sub, req.query.lang));
}));

// Submit renewal: choose plan + upload receipt. Creates pending subscription + payment + receipt in one transaction.
// If a renewal already exists and its payment is awaiting_new_receipt, the new receipt is attached to it instead.
router.post('/renew/:token', limiter(20, 60), receiptUpload.single('receipt'), wrap(async (req, res) => {
  const sub = await subscriptionByToken(req.params.token);
  const body = z.object({ planId: z.string().uuid(), note: z.string().max(500).optional() }).parse(req.body);
  if (!req.file) throw validationFailed('Please attach the transfer screenshot');
  const fakeReq = { companyId: sub.companyId, user: null, owner: { id: sub.ownerId }, ip: req.ip };
  try {
    const result = await db.transaction(async (t) => {
      const existing = await t.query.subscriptions.findFirst({ where: and(eq(subscriptions.renewedFromId, sub.id), sql`${subscriptions.status} <> 'cancelled'`), orderBy: [desc(subscriptions.createdAt)] });
      let payment; let newSub = existing;
      if (existing) {
        payment = await t.query.payments.findFirst({ where: eq(payments.subscriptionId, existing.id), orderBy: [desc(payments.createdAt)] });
        if (existing.status !== 'pending_payment' || !payment || payment.status === 'approved') throw conflict('This subscription has already been renewed');
        // Owner changed plan on a rejected request → cancel the old pending subscription and create a fresh one
        if (payment.status === 'awaiting_new_receipt' && body.planId !== existing.planId) {
          await t.update(subscriptions).set({ status: 'cancelled', statusReason: 'Owner selected a different plan on re-submission', updatedAt: new Date() }).where(eq(subscriptions.id, existing.id));
          await t.update(payments).set({ status: 'rejected', updatedAt: new Date() }).where(eq(payments.id, payment.id));
          newSub = null;
        }
      }
      if (!newSub) {
        const vehicleIds = (await t.select({ vehicleId: subscriptionVehicles.vehicleId }).from(subscriptionVehicles).where(eq(subscriptionVehicles.subscriptionId, sub.id))).map((v) => v.vehicleId);
        const startDate = sub.endDate >= today() ? addDays(sub.endDate, 1) : today();
        const created = await createSubscription(fakeReq, { unitId: sub.unitId, compoundId: sub.compoundId, vehicleIds, planId: body.planId, startDate, paymentMethod: 'bank_transfer', paymentStatus: 'pending', renewedFromId: sub.id, notes: 'Renewal requested by owner via portal' }, t);
        newSub = created.subscription; payment = created.payment;
        const renewalCode = await nextCode(sub.companyId, 'renewal', 'REN', t);
        const [renewal] = await t.insert(subscriptionRenewals).values({ companyId: sub.companyId, renewalCode, previousSubscriptionId: sub.id, newSubscriptionId: newSub.id, requestedBy: 'owner', status: 'pending', notes: body.note || null }).returning();
        await t.update(payments).set({ renewalId: renewal.id }).where(eq(payments.id, payment.id));
      } else if (payment.status === 'awaiting_new_receipt') {
        await t.update(payments).set({ status: 'pending_verification', rejectionReason: null, updatedAt: new Date() }).where(eq(payments.id, payment.id));
        await t.update(subscriptions).set({ paymentStatus: 'pending', statusReason: null, updatedAt: new Date() }).where(eq(subscriptions.id, newSub.id));
        if (payment.renewalId) await t.update(subscriptionRenewals).set({ status: 'pending', updatedAt: new Date() }).where(eq(subscriptionRenewals.id, payment.renewalId));
      } else throw conflict('A receipt for this renewal is already awaiting verification');
      const key = await storeUpload(req.file.path, storageKey('receipts', req.file), req.file.mimetype);
      const [receipt] = await t.insert(paymentReceipts).values({ paymentId: payment.id, filePath: key, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, uploadedByType: 'owner' }).returning();
      if (body.note) await t.update(payments).set({ ownerNote: body.note }).where(eq(payments.id, payment.id));
      await notifyAdmins(sub.companyId, { type: 'payment.pending', title: `Renewal receipt uploaded – ${newSub.subscriptionCode}`, body: `${money(newSub.finalAmount)} · awaiting verification`, entityType: 'payment', entityId: payment.id }, t);
      await systemAudit(sub.companyId, { action: 'portal.renewal_submitted', entityType: 'payment', entityId: payment.id, after: { subscriptionId: newSub.id, receiptId: receipt.id, ownerId: sub.ownerId } }, t);
      return { subscription: newSub, payment, receipt };
    });
    // SMS confirmation (best effort)
    try {
      const owner = await db.query.owners.findFirst({ where: eq(owners.id, sub.ownerId) });
      const plates = (await db.execute(sql`SELECT string_agg(v.plate_number, ', ') AS p FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${sub.id}`).then((r) => (r.rows || r)[0]))?.p;
      await sendSms(sub.companyId, { to: owner.mobile, ownerId: owner.id, templateKey: 'renewal_received', vars: { OwnerName: owner.name, VehicleNumber: plates, RenewalId: result.subscription.subscriptionCode, Amount: result.subscription.finalAmount } });
    } catch (e) { console.error('renewal_received SMS failed', e); }
    res.status(201).json({ requestCode: result.subscription.subscriptionCode, paymentCode: result.payment.paymentCode, status: 'pending_verification', amount: Number(result.subscription.finalAmount), startDate: result.subscription.startDate, endDate: result.subscription.endDate });
  } catch (e) { if (req.file) fs.unlink(req.file.path, () => {}); throw e; }
}));

// ───────────────────────── 2. OTP login ─────────────────────────
router.post('/otp/request', limiter(10, 15), wrap(async (req, res) => {
  const { mobile } = z.object({ mobile: z.string().min(6) }).parse(req.body);
  const m = normalizeMobile(mobile);
  const owner = await db.query.owners.findFirst({ where: inArray(owners.mobile, mobileCandidates(m)) });
  // Same response whether or not the number exists (no enumeration)
  if (!owner) return res.json({ ok: true, expiresInMinutes: 5 });
  const otp = await getSetting(owner.companyId, 'otp');
  const recent = await db.query.otpCodes.findFirst({ where: and(eq(otpCodes.ownerId, owner.id), gt(otpCodes.createdAt, new Date(Date.now() - otp.resendCooldownSeconds * 1000))) });
  if (recent) throw new AppError(429, 'OTP_COOLDOWN', `Please wait ${otp.resendCooldownSeconds} seconds before requesting a new code`);
  const code = String(crypto.randomInt(0, 10 ** otp.length)).padStart(otp.length, '0');
  await db.insert(otpCodes).values({ companyId: owner.companyId, ownerId: owner.id, mobile: owner.mobile, codeHash: await bcrypt.hash(code, 8), expiresAt: new Date(Date.now() + otp.expiryMinutes * 60000) });
  const log = await sendSms(owner.companyId, { to: owner.mobile, ownerId: owner.id, templateKey: 'otp', vars: { Code: code, Minutes: otp.expiryMinutes } });
  await systemAudit(owner.companyId, { action: 'portal.otp_requested', entityType: 'owner', entityId: owner.id, after: { smsStatus: log.status } });
  res.json({ ok: true, expiresInMinutes: otp.expiryMinutes, delivery: log.status });
}));

router.post('/otp/verify', limiter(20, 15), wrap(async (req, res) => {
  const { mobile, code } = z.object({ mobile: z.string().min(6), code: z.string().min(4).max(8) }).parse(req.body);
  const owner = await db.query.owners.findFirst({ where: inArray(owners.mobile, mobileCandidates(normalizeMobile(mobile))) });
  if (!owner) throw unauthorized('Invalid code');
  const otp = await getSetting(owner.companyId, 'otp');
  const rec = await db.query.otpCodes.findFirst({ where: and(eq(otpCodes.ownerId, owner.id), sql`${otpCodes.usedAt} IS NULL`, gt(otpCodes.expiresAt, new Date())), orderBy: [desc(otpCodes.createdAt)] });
  if (!rec) throw unauthorized('Code expired – request a new one');
  if (rec.attempts >= otp.maxAttempts) throw unauthorized('Too many attempts – request a new code');
  const ok = await bcrypt.compare(code, rec.codeHash);
  if (!ok) { await db.update(otpCodes).set({ attempts: rec.attempts + 1 }).where(eq(otpCodes.id, rec.id)); throw unauthorized('Invalid code'); }
  await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, rec.id));
  const portal = await getSetting(owner.companyId, 'portal');
  const token = crypto.randomBytes(32).toString('base64url');
  await db.insert(ownerSessions).values({ ownerId: owner.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + (portal.sessionDays || 30) * 86400000), userAgent: String(req.headers['user-agent'] || '').slice(0, 300), lastSeenAt: new Date() });
  await systemAudit(owner.companyId, { action: 'portal.login', entityType: 'owner', entityId: owner.id });
  res.json({ token, owner: { id: owner.id, name: owner.name, mobile: owner.mobile }, company: await publicCompany(owner.companyId) });
}));

// ───────────────────────── Owner session middleware ─────────────────────────
async function ownerAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();
    const session = await db.query.ownerSessions.findFirst({ where: and(eq(ownerSessions.tokenHash, crypto.createHash('sha256').update(token).digest('hex')), gt(ownerSessions.expiresAt, new Date())) });
    if (!session) throw unauthorized('Session expired');
    const owner = await db.query.owners.findFirst({ where: eq(owners.id, session.ownerId) });
    if (!owner) throw unauthorized();
    db.update(ownerSessions).set({ lastSeenAt: new Date() }).where(eq(ownerSessions.id, session.id)).catch(() => {});
    req.owner = owner; req.companyId = owner.companyId; req.ownerSessionId = session.id;
    next();
  } catch (e) { next(e); }
}

router.post('/logout', ownerAuth, wrap(async (req, res) => { await db.delete(ownerSessions).where(eq(ownerSessions.id, req.ownerSessionId)); res.json({ ok: true }); }));

const currentSub = (col) => sql`(SELECT ${sql.raw(col)} FROM subscriptions s JOIN subscription_vehicles sv ON sv.subscription_id = s.id WHERE sv.vehicle_id = ${vehicles.id} AND s.status <> 'cancelled' ORDER BY s.end_date DESC LIMIT 1)`;

router.get('/me', ownerAuth, wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const o = req.owner;
  const unitRows = await db.select({ id: units.id, unitNumber: units.unitNumber, compoundName: compounds.name, compoundId: compounds.id }).from(units).innerJoin(compounds, eq(compounds.id, units.compoundId)).where(eq(units.ownerId, o.id)).orderBy(compounds.name, units.unitNumber);
  const vehicleRows = await db.select({
    id: vehicles.id, plateNumber: vehicles.plateNumber, brand: vehicles.brand, model: vehicles.model, color: vehicles.color, vehicleType: vehicles.vehicleType, parkingLocation: vehicles.parkingLocation, unitNumber: units.unitNumber, compoundName: compounds.name,
    subscriptionId: currentSub('s.id'), subscriptionStatus: currentSub('s.status'), planName: currentSub("s.plan_snapshot->>'name'"), planNameAr: currentSub("s.plan_snapshot->>'nameAr'"), startDate: currentSub('s.start_date::text'), endDate: currentSub('s.end_date::text'),
    washesAllowed: currentSub('s.washes_allowed').mapWith(Number), washesUsed: currentSub('s.washes_used').mapWith(Number), daysRemaining: currentSub('(s.end_date - CURRENT_DATE)::int').mapWith(Number),
  }).from(vehicles).innerJoin(units, eq(units.id, vehicles.unitId)).innerJoin(compounds, eq(compounds.id, vehicles.compoundId)).where(and(eq(vehicles.ownerId, o.id), eq(vehicles.status, 'active'))).orderBy(vehicles.plateNumber);
  const [stats] = await db.execute(sql`SELECT
      count(*) FILTER (WHERE status IN ('active','expiring_soon'))::int AS active, count(*) FILTER (WHERE status='expiring_soon')::int AS expiring, count(*) FILTER (WHERE status='expired')::int AS expired,
      (SELECT count(*) FROM payments p WHERE p.owner_id = ${o.id} AND p.status IN ('pending_verification','awaiting_new_receipt'))::int AS pending_requests
    FROM subscriptions WHERE owner_id = ${o.id}`).then((r) => r.rows || r);
  res.json({ owner: { id: o.id, name: o.name, mobile: o.mobile, email: o.email }, company: await publicCompany(o.companyId), units: unitRows, vehicles: vehicleRows, stats });
}));

router.get('/vehicles/:id', ownerAuth, wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const v = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, req.params.id), eq(vehicles.ownerId, req.owner.id)), with: { unit: true, compound: true } });
  if (!v) throw notFound('Vehicle');
  const subs = await db.select().from(subscriptionVehicles).innerJoin(subscriptions, eq(subscriptions.id, subscriptionVehicles.subscriptionId)).where(eq(subscriptionVehicles.vehicleId, v.id)).orderBy(desc(subscriptions.startDate));
  const list = subs.map(({ subscriptions: s }) => ({ id: s.id, code: s.subscriptionCode, planName: s.planSnapshot?.name, planNameAr: s.planSnapshot?.nameAr, startDate: s.startDate, endDate: s.endDate, status: s.status, washesAllowed: s.washesAllowed, washesUsed: s.washesUsed, allowedDays: s.allowedDays, frequencyPerWeek: s.frequencyPerWeek, finalAmount: Number(s.finalAmount), paymentStatus: s.paymentStatus, renewedFromId: s.renewedFromId, renewalToken: s.status !== 'cancelled' && s.paymentStatus === 'paid' ? null : undefined }));
  const current = list.find((s) => ['active', 'expiring_soon'].includes(s.status)) || list.find((s) => s.status === 'pending_payment') || list.find((s) => s.status === 'expired') || list[0] || null;
  // Next eligible washing day from allowed days
  let nextWash = null;
  if (current && ['active', 'expiring_soon'].includes(current.status) && current.washesUsed < current.washesAllowed) {
    for (let i = 0; i < 14; i++) { const d = addDays(today(), i); if (current.allowedDays.includes(new Date(d + 'T00:00:00Z').getUTCDay()) && d <= current.endDate) { nextWash = d; break; } }
  }
  const pays = await db.select({ id: payments.id, code: payments.paymentCode, amount: payments.amount, method: payments.method, status: payments.status, paymentDate: payments.paymentDate, createdAt: payments.createdAt, rejectionReason: payments.rejectionReason, subscriptionCode: subscriptions.subscriptionCode })
    .from(payments).innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId)).innerJoin(subscriptionVehicles, eq(subscriptionVehicles.subscriptionId, subscriptions.id)).where(and(eq(subscriptionVehicles.vehicleId, v.id), eq(payments.ownerId, req.owner.id))).orderBy(desc(payments.createdAt));
  // Renewal link for the latest renewable subscription (lets the owner renew from inside the portal too)
  let renewLink = null;
  const renewable = list.find((s) => ['active', 'expiring_soon', 'expired'].includes(s.status) && !list.some((x) => x.renewedFromId === s.id && x.status !== 'cancelled'));
  if (renewable) { const { ensureRenewalToken } = await import('../services/renewalLinkService.js'); renewLink = `/p/renew/${await ensureRenewalToken(renewable.id)}`; }
  res.json({ vehicle: { id: v.id, plateNumber: v.plateNumber, brand: v.brand, model: v.model, color: v.color, vehicleType: v.vehicleType, parkingLocation: v.parkingLocation, unitNumber: v.unit.unitNumber, compoundName: v.compound.name }, current, nextWash, subscriptions: list, payments: pays, renewLink });
}));

// Wash calendar: month view of tasks/operations for all the owner's vehicles
router.get('/washes', ownerAuth, wrap(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
  const vehicleId = req.query.vehicleId || null;
  const rows = await db.execute(sql`
    SELECT t.id AS task_id, t.scheduled_date::text, t.status AS task_status, v.id AS vehicle_id, v.plate_number,
           o.id AS operation_id, o.start_time, o.end_time, o.notes, o.status AS operation_status, o.issue_reported,
           u.name AS staff_name,
           (SELECT count(*) FROM wash_photos p WHERE p.operation_id = o.id AND p.phase='before')::int AS before_count,
           (SELECT count(*) FROM wash_photos p WHERE p.operation_id = o.id AND p.phase='after')::int AS after_count
    FROM washing_tasks t
    JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN washing_operations o ON o.task_id = t.id
    LEFT JOIN users u ON u.id = coalesce(o.staff_id, t.assigned_to)
    WHERE v.owner_id = ${req.owner.id} AND to_char(t.scheduled_date, 'YYYY-MM') = ${month} ${vehicleId ? sql`AND v.id = ${vehicleId}` : sql``}
    ORDER BY t.scheduled_date`).then((r) => r.rows || r);
  res.json({ month, items: rows });
}));

router.get('/washes/:operationId', ownerAuth, wrap(async (req, res) => {
  const [op] = await db.execute(sql`SELECT o.*, v.plate_number, u.name AS staff_name, t.scheduled_date::text FROM washing_operations o JOIN vehicles v ON v.id = o.vehicle_id JOIN washing_tasks t ON t.id = o.task_id LEFT JOIN users u ON u.id = o.staff_id
    WHERE o.id = ${req.params.operationId} AND v.owner_id = ${req.owner.id}`).then((r) => r.rows || r);
  if (!op) throw notFound('Wash');
  const photos = await db.select({ id: washPhotos.id, phase: washPhotos.phase, takenAt: washPhotos.takenAt, uploadedAt: washPhotos.uploadedAt }).from(washPhotos).where(eq(washPhotos.operationId, op.id)).orderBy(washPhotos.phase, washPhotos.uploadedAt);
  res.json({ ...op, photos });
}));

router.get('/photos/:photoId', ownerAuth, wrap(async (req, res) => {
  const [p] = await db.execute(sql`SELECT p.file_path, p.mime_type FROM wash_photos p JOIN washing_operations o ON o.id = p.operation_id JOIN vehicles v ON v.id = o.vehicle_id WHERE p.id = ${req.params.photoId} AND v.owner_id = ${req.owner.id}`).then((r) => r.rows || r);
  if (!p) throw notFound('Photo');
  await sendStored(res, p.file_path, p.mime_type);
}));

// Renewal requests tracking
router.get('/requests', ownerAuth, wrap(async (req, res) => {
  const rows = await db.execute(sql`SELECT p.id, p.payment_code, p.amount, p.status, p.rejection_reason, p.created_at, p.approved_at, s.subscription_code, s.start_date::text, s.end_date::text, s.plan_snapshot->>'name' AS plan_name, s.plan_snapshot->>'nameAr' AS plan_name_ar, s.renewed_from_id,
      (SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = s.id) AS plates,
      (SELECT count(*) FROM payment_receipts r WHERE r.payment_id = p.id)::int AS receipts,
      (SELECT s0.renewal_token FROM subscriptions s0 WHERE s0.id = s.renewed_from_id AND s0.renewal_token_expires_at > now()) AS renewal_token
    FROM payments p JOIN subscriptions s ON s.id = p.subscription_id WHERE p.owner_id = ${req.owner.id} ORDER BY p.created_at DESC LIMIT 50`).then((r) => r.rows || r);
  res.json(rows);
}));

export { ownerAuth };
export default router;
