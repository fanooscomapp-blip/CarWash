import { and, eq, inArray, sql, ne, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { suggestWashDays } from './washDaysService.js';
import { badRequest, conflict, notFound, validationFailed } from '../lib/errors.js';
import { addDays, daysBetween, money, nextCode, today } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { getSetting } from './settingsService.js';
import { notifyAdmins } from './notificationService.js';
import { sendSms } from './smsService.js';
import { renewalLink } from './renewalLinkService.js';

const { subscriptions, subscriptionVehicles, subscriptionPlans, planPrices, vehicles, units, owners, payments, subscriptionRenewals } = schema;

export const SUB_STATUS = ['pending_payment', 'active', 'expiring_soon', 'expired', 'suspended', 'cancelled'];

// Pure status derivation – shared with the bulk SQL refresh below.
export function deriveStatus(sub, onDate = today(), expiringSoonDays = 7) {
  if (sub.status === 'cancelled' || sub.status === 'suspended') return sub.status;
  if (sub.paymentStatus !== 'paid') return 'pending_payment';
  if (sub.endDate < onDate) return 'expired';
  if (daysBetween(onDate, sub.endDate) <= expiringSoonDays) return 'expiring_soon';
  return 'active';
}

// Recomputes status for all subscriptions of a company in one statement. Cheap enough to run before listings and on a cron.
export async function refreshStatuses(companyId, tx = db) {
  const { expiringSoonDays } = await getSetting(companyId, 'general');
  await tx.execute(sql`
    UPDATE subscriptions SET status = CASE
        WHEN status IN ('cancelled','suspended') THEN status
        WHEN payment_status <> 'paid' THEN 'pending_payment'
        WHEN end_date < CURRENT_DATE THEN 'expired'
        WHEN end_date - CURRENT_DATE <= ${expiringSoonDays} THEN 'expiring_soon'
        ELSE 'active' END,
      updated_at = CASE WHEN status <> (CASE
        WHEN status IN ('cancelled','suspended') THEN status
        WHEN payment_status <> 'paid' THEN 'pending_payment'
        WHEN end_date < CURRENT_DATE THEN 'expired'
        WHEN end_date - CURRENT_DATE <= ${expiringSoonDays} THEN 'expiring_soon'
        ELSE 'active' END) THEN now() ELSE updated_at END
    WHERE company_id = ${companyId}`);
}

// Resolves the plan price for a compound / vehicle type, honouring overrides (most specific wins).
export async function resolvePlanPrice(planId, compoundId, vehicleType, tx = db) {
  const plan = await tx.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, planId), with: { prices: true } });
  if (!plan) throw notFound('Subscription plan');
  const overrides = plan.prices || [];
  const pick =
    overrides.find((p) => p.compoundId === compoundId && p.vehicleType === vehicleType) ||
    overrides.find((p) => p.compoundId === compoundId && !p.vehicleType) ||
    overrides.find((p) => !p.compoundId && p.vehicleType === vehicleType);
  return { plan, price: money(pick ? pick.price : plan.price), overrideApplied: !!pick };
}

async function assertVehiclesEligible(companyId, vehicleIds, unitId, tx) {
  if (!vehicleIds?.length) throw validationFailed('At least one vehicle is required');
  const rows = await tx.select().from(vehicles).where(and(eq(vehicles.companyId, companyId), inArray(vehicles.id, vehicleIds)));
  if (rows.length !== vehicleIds.length) throw notFound('One or more vehicles');
  for (const v of rows) {
    if (v.unitId !== unitId) throw validationFailed(`Vehicle ${v.plateNumber} does not belong to the selected unit`);
    if (v.status !== 'active') throw validationFailed(`Vehicle ${v.plateNumber} is inactive`);
  }
  return rows;
}

// Blocks a second live subscription for the same vehicle over an overlapping period.
async function assertNoOverlap(companyId, vehicleIds, startDate, endDate, tx, ignoreSubscriptionId = null) {
  const rows = await tx.execute(sql`
    SELECT s.id, s.subscription_code, v.plate_number FROM subscriptions s
    JOIN subscription_vehicles sv ON sv.subscription_id = s.id
    JOIN vehicles v ON v.id = sv.vehicle_id
    WHERE s.company_id = ${companyId}
      AND sv.vehicle_id IN (${sql.join(vehicleIds.map((id) => sql`${id}`), sql`, `)})
      AND s.status NOT IN ('cancelled','expired')
      AND s.start_date <= ${endDate} AND s.end_date >= ${startDate}
      ${ignoreSubscriptionId ? sql`AND s.id <> ${ignoreSubscriptionId}` : sql``}
    LIMIT 1`);
  const hit = rows.rows?.[0] || rows[0];
  if (hit) throw conflict(`Vehicle ${hit.plate_number} already has subscription ${hit.subscription_code} covering this period`, { subscriptionId: hit.id });
}

/**
 * Creates a subscription (and its payment record). Used by both new subscriptions and renewals.
 * input: { compoundId, unitId, vehicleIds, planId, startDate, durationDays?, washesAllowed?, allowedDays?, frequencyPerWeek?, price?, discount, paymentMethod, paymentStatus, notes, renewedFromId? }
 */
export async function createSubscription(req, input, tx) {
  const run = async (t) => {
    const companyId = req.companyId;
    const unit = await t.query.units.findFirst({ where: and(eq(units.id, input.unitId), eq(units.companyId, companyId)), with: { owner: true, compound: true } });
    if (!unit) throw notFound('Unit');
    if (input.compoundId && unit.compoundId !== input.compoundId) throw validationFailed('Unit does not belong to the selected compound');
    if (unit.compound.status !== 'active') throw validationFailed('Compound is inactive');

    const vehicleRows = await assertVehiclesEligible(companyId, input.vehicleIds, unit.id, t);
    const vehicleType = vehicleRows[0].vehicleType;
    const { plan, price: resolvedPrice } = await resolvePlanPrice(input.planId, unit.compoundId, vehicleType, t);
    if (!plan.isActive) throw validationFailed('Subscription plan is inactive');
    if (plan.scope === 'per_vehicle' && vehicleRows.length > 1) throw validationFailed('This plan covers a single vehicle');
    if (vehicleRows.length > plan.maxVehicles) throw validationFailed(`This plan allows at most ${plan.maxVehicles} vehicle(s)`);

    const startDate = input.startDate || today();
    const durationDays = Number(input.durationDays || plan.durationDays);
    if (durationDays < 1) throw validationFailed('Duration must be at least one day');
    const endDate = addDays(startDate, durationDays - 1);
    await assertNoOverlap(companyId, input.vehicleIds, startDate, endDate, t);

    const price = money(input.price ?? resolvedPrice);
    const discount = money(input.discount ?? 0);
    if (discount < 0 || discount > price) throw validationFailed('Discount must be between 0 and the price');
    const finalAmount = money(price - discount);
    const paymentStatus = input.paymentStatus === 'paid' ? 'paid' : 'pending';

    // No explicit days → fixed weekly pattern chosen by compound load (e.g. Sat/Mon/Wed for 3×/week)
    const perWeek = Number(input.frequencyPerWeek ?? plan.maxFrequencyPerWeek);
    let autoDays = plan.allowedDays;
    if (!input.allowedDays && perWeek < plan.allowedDays.length) autoDays = (await suggestWashDays(companyId, { compoundId: unit.compoundId, workingDays: plan.allowedDays, perWeek, ownerId: unit.ownerId })).suggested;
    const code = await nextCode(companyId, 'subscription', 'SUB', t);
    const draft = {
      companyId, subscriptionCode: code, compoundId: unit.compoundId, unitId: unit.id, ownerId: unit.ownerId,
      planId: plan.id,
      planSnapshot: { id: plan.id, name: plan.name, nameAr: plan.nameAr, planType: plan.planType, durationDays: plan.durationDays, price: plan.price, allowedDays: plan.allowedDays, maxFrequencyPerWeek: plan.maxFrequencyPerWeek, maxWashes: plan.maxWashes, scope: plan.scope },
      startDate, endDate, durationDays,
      washesAllowed: Number(input.washesAllowed ?? plan.maxWashes),
      allowedDays: input.allowedDays ?? autoDays,
      frequencyPerWeek: Number(input.frequencyPerWeek ?? plan.maxFrequencyPerWeek),
      price: String(price), discount: String(discount), finalAmount: String(finalAmount),
      paymentMethod: input.paymentMethod || 'bank_transfer', paymentStatus,
      status: 'pending_payment', notes: input.notes || null, renewedFromId: input.renewedFromId || null,
      createdBy: req.user?.id || null, isDemo: false,
    };
    draft.status = deriveStatus(draft, today(), (await getSetting(companyId, 'general')).expiringSoonDays);

    const [sub] = await t.insert(subscriptions).values(draft).returning();
    await t.insert(subscriptionVehicles).values(input.vehicleIds.map((vehicleId) => ({ subscriptionId: sub.id, vehicleId })));

    const paymentCode = await nextCode(companyId, 'payment', 'PAY', t);
    const [payment] = await t.insert(payments).values({
      companyId, paymentCode, subscriptionId: sub.id, ownerId: unit.ownerId, compoundId: unit.compoundId,
      amount: String(finalAmount), method: draft.paymentMethod,
      paymentDate: paymentStatus === 'paid' ? today() : null,
      status: paymentStatus === 'paid' ? 'approved' : 'pending_verification',
      approvedBy: paymentStatus === 'paid' ? req.user?.id || null : null,
      approvedAt: paymentStatus === 'paid' ? new Date() : null,
      notes: input.paymentNotes || null,
    }).returning();

    await audit(req, { action: 'subscription.create', entityType: 'subscription', entityId: sub.id, after: { ...sub, vehicleIds: input.vehicleIds, paymentId: payment.id } }, t);
    if (paymentStatus !== 'paid') {
      await notifyAdmins(companyId, { type: 'payment.pending', title: `Payment pending for ${code}`, body: `${unit.owner.name} – ${finalAmount}`, entityType: 'payment', entityId: payment.id }, t);
    }
    return { subscription: sub, payment };
  };
  return tx ? run(tx) : db.transaction(run);
}

export async function renewSubscription(req, previousId, input) {
  return db.transaction(async (t) => {
    const prev = await t.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, previousId), eq(subscriptions.companyId, req.companyId)), with: { vehicles: true } });
    if (!prev) throw notFound('Subscription');
    if (prev.status === 'cancelled') throw badRequest('A cancelled subscription cannot be renewed; create a new one instead');
    const existing = await t.query.subscriptions.findFirst({ where: and(eq(subscriptions.renewedFromId, prev.id), ne(subscriptions.status, 'cancelled')) });
    if (existing) throw conflict(`This subscription was already renewed as ${existing.subscriptionCode}`, { subscriptionId: existing.id });

    const startDate = input.startDate || (prev.endDate >= today() ? addDays(prev.endDate, 1) : today());
    const vehicleIds = input.vehicleIds?.length ? input.vehicleIds : prev.vehicles.map((v) => v.vehicleId);
    const planId = input.planId || prev.planId;
    const plan = await t.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, planId) });
    const base = { unitId: prev.unitId, compoundId: prev.compoundId, planId, startDate, durationDays: input.durationDays, washesAllowed: input.washesAllowed, allowedDays: input.allowedDays, price: input.price, discount: input.discount, paymentMethod: input.paymentMethod, paymentStatus: input.paymentStatus, notes: input.notes };
    // Switching a multi-car subscription to a per-car plan → one new subscription per car (the first one is the renewal)
    const split = plan?.scope === 'per_vehicle' && vehicleIds.length > 1;
    const { subscription, payment } = await createSubscription(req, { ...base, vehicleIds: split ? [vehicleIds[0]] : vehicleIds, renewedFromId: prev.id }, t);
    const extra = [];
    if (split) for (const vid of vehicleIds.slice(1)) extra.push(await createSubscription(req, { ...base, vehicleIds: [vid], allowedDays: undefined, notes: `${input.notes || ''} (split from ${prev.subscriptionCode})`.trim() }, t));
    const renewalCode = await nextCode(req.companyId, 'renewal', 'REN', t);
    const [renewal] = await t.insert(subscriptionRenewals).values({
      companyId: req.companyId, renewalCode, previousSubscriptionId: prev.id, newSubscriptionId: subscription.id,
      requestedBy: req.user ? 'admin' : 'owner', requestedByUserId: req.user?.id || null,
      status: payment.status === 'approved' ? 'completed' : 'pending', notes: input.notes || null,
    }).returning();
    await t.update(payments).set({ renewalId: renewal.id }).where(eq(payments.id, payment.id));
    await audit(req, { action: 'subscription.renew', entityType: 'subscription', entityId: prev.id, after: { renewalId: renewal.id, newSubscriptionId: subscription.id } }, t);
    return { subscription, payment, renewal, extra: extra.map((e) => e.subscription) };
  });
}

export async function approvePayment(req, paymentId, notes) {
  return db.transaction(async (t) => {
    const [payment] = await t.execute(sql`SELECT * FROM payments WHERE id = ${paymentId} AND company_id = ${req.companyId} FOR UPDATE`).then((r) => r.rows || r);
    if (!payment) throw notFound('Payment');
    if (payment.status === 'approved') throw conflict('Payment is already approved');
    await t.update(payments).set({ status: 'approved', approvedBy: req.user.id, approvedAt: new Date(), paymentDate: payment.payment_date || today(), notes: notes ?? payment.notes, rejectionReason: null, updatedAt: new Date() }).where(eq(payments.id, paymentId));
    const [sub] = await t.select().from(subscriptions).where(eq(subscriptions.id, payment.subscription_id)).for('update');
    const newStatus = deriveStatus({ ...sub, paymentStatus: 'paid' }, today(), (await getSetting(req.companyId, 'general')).expiringSoonDays);
    await t.update(subscriptions).set({ paymentStatus: 'paid', status: newStatus, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    if (payment.renewal_id) await t.update(subscriptionRenewals).set({ status: 'completed', updatedAt: new Date() }).where(eq(subscriptionRenewals.id, payment.renewal_id));
    await audit(req, { action: 'payment.approve', entityType: 'payment', entityId: paymentId, before: { status: payment.status }, after: { status: 'approved', subscriptionStatus: newStatus } }, t);
    return { paymentId, subscriptionId: sub.id, subscriptionStatus: newStatus, _notify: { ownerId: sub.ownerId, endDate: sub.endDate } };
  }).then(async (r) => {
    // Outside the transaction: SMS to the owner (best effort, logged)
    try {
      const notif = await getSetting(req.companyId, 'notifications');
      if (notif.smsOnPaymentApproved) {
        const ctx = await paymentSmsContext(r.subscriptionId);
        if (ctx) await sendSms(req.companyId, { to: ctx.mobile, ownerId: ctx.ownerId, templateKey: 'payment_approved', vars: ctx.vars });
      }
    } catch (e) { console.error('payment approved SMS failed', e); }
    delete r._notify; return r;
  });
}

async function paymentSmsContext(subscriptionId) {
  const [row] = await db.execute(sql`SELECT o.id AS owner_id, o.name, o.mobile, s.end_date::text, s.subscription_code, s.final_amount, s.plan_snapshot->>'name' AS plan_name,
      (SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = s.id) AS plates
    FROM subscriptions s JOIN owners o ON o.id = s.owner_id WHERE s.id = ${subscriptionId}`).then((r) => r.rows || r);
  if (!row) return null;
  const [y, m, d] = row.end_date.split('-');
  return { ownerId: row.owner_id, mobile: row.mobile, vars: { OwnerName: row.name, VehicleNumber: row.plates, ExpiryDate: `${d}/${m}/${y}`, RenewalId: row.subscription_code, Amount: row.final_amount, PlanName: row.plan_name } };
}

export async function rejectPayment(req, paymentId, reason) {
  if (!reason?.trim()) throw validationFailed('A rejection reason is required');
  return db.transaction(async (t) => {
    const [payment] = await t.execute(sql`SELECT * FROM payments WHERE id = ${paymentId} AND company_id = ${req.companyId} FOR UPDATE`).then((r) => r.rows || r);
    if (!payment) throw notFound('Payment');
    if (payment.status === 'approved') throw conflict('An approved payment cannot be rejected; cancel the subscription instead');
    await t.update(payments).set({ status: 'awaiting_new_receipt', rejectionReason: reason, updatedAt: new Date() }).where(eq(payments.id, paymentId));
    await t.update(subscriptions).set({ paymentStatus: 'rejected', status: 'pending_payment', statusReason: reason, updatedAt: new Date() }).where(eq(subscriptions.id, payment.subscription_id));
    if (payment.renewal_id) await t.update(subscriptionRenewals).set({ status: 'rejected', notes: reason, updatedAt: new Date() }).where(eq(subscriptionRenewals.id, payment.renewal_id));
    await audit(req, { action: 'payment.reject', entityType: 'payment', entityId: paymentId, before: { status: payment.status }, after: { status: 'awaiting_new_receipt' }, reason }, t);
    return { paymentId, subscriptionId: payment.subscription_id };
  }).then(async (r) => {
    try {
      const notif = await getSetting(req.companyId, 'notifications');
      if (notif.smsOnPaymentRejected) {
        const ctx = await paymentSmsContext(r.subscriptionId);
        // The rejected subscription is the *new* one; its renewal link is the link of the previous subscription in the chain (or itself when no chain)
        const [sub] = await db.select({ renewedFromId: subscriptions.renewedFromId }).from(subscriptions).where(eq(subscriptions.id, r.subscriptionId));
        const link = await renewalLink(sub.renewedFromId || r.subscriptionId);
        if (ctx) await sendSms(req.companyId, { to: ctx.mobile, ownerId: ctx.ownerId, templateKey: 'payment_rejected', vars: { ...ctx.vars, Reason: reason, RenewalLink: link } });
      }
    } catch (e) { console.error('payment rejected SMS failed', e); }
    return r;
  });
}

export async function changeSubscriptionStatus(req, id, action, reason) {
  return db.transaction(async (t) => {
    const [sub] = await t.select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.companyId, req.companyId))).for('update');
    if (!sub) throw notFound('Subscription');
    let status;
    if (action === 'cancel') {
      if (sub.status === 'cancelled') throw conflict('Already cancelled');
      if (!reason?.trim()) throw validationFailed('A reason is required to cancel');
      status = 'cancelled';
    } else if (action === 'suspend') {
      if (!['active', 'expiring_soon'].includes(sub.status)) throw badRequest('Only active subscriptions can be suspended');
      if (!reason?.trim()) throw validationFailed('A reason is required to suspend');
      status = 'suspended';
    } else if (action === 'resume') {
      if (sub.status !== 'suspended') throw badRequest('Only suspended subscriptions can be resumed');
      status = deriveStatus({ ...sub, status: 'active' }, today(), (await getSetting(req.companyId, 'general')).expiringSoonDays);
    } else throw badRequest('Unknown action');
    await t.update(subscriptions).set({ status, statusReason: reason || null, updatedAt: new Date() }).where(eq(subscriptions.id, id));
    await audit(req, { action: `subscription.${action}`, entityType: 'subscription', entityId: id, before: { status: sub.status }, after: { status }, reason }, t);
    return { id, status };
  });
}
