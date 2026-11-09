import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getSetting } from './settingsService.js';
import { sendSms } from './smsService.js';
import { systemAudit } from '../lib/audit.js';
import { config } from '../lib/config.js';

const { subscriptions, subscriptionReminders, owners, units, compounds } = schema;

export async function portalBaseUrl(companyId) {
  const portal = await getSetting(companyId, 'portal');
  return (portal.baseUrl || config.publicUrl || config.corsOrigin.split(',')[0]).replace(/\/$/, '');
}

// Returns a valid renewal link for the subscription, minting/rotating the token when missing or expired.
export async function ensureRenewalToken(subscriptionId, tx = db) {
  const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!sub) throw new Error('Subscription not found');
  const portal = await getSetting(sub.companyId, 'portal');
  const now = new Date();
  if (sub.renewalToken && sub.renewalTokenExpiresAt && sub.renewalTokenExpiresAt > now) return sub.renewalToken;
  const token = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(now.getTime() + (portal.linkValidDays || 30) * 86400000);
  await tx.update(subscriptions).set({ renewalToken: token, renewalTokenExpiresAt: expires }).where(eq(subscriptions.id, subscriptionId));
  return token;
}

export async function renewalLink(subscriptionId) {
  const [sub] = await db.select({ companyId: subscriptions.companyId }).from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  const token = await ensureRenewalToken(subscriptionId);
  return `${await portalBaseUrl(sub.companyId)}/p/renew/${token}`;
}

async function subscriptionContext(subscriptionId) {
  const [row] = await db.select({
    sub: subscriptions, ownerName: owners.name, ownerMobile: owners.mobile, ownerId: owners.id, unitNumber: units.unitNumber, compoundName: compounds.name,
    plates: sql`(SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${subscriptions.id})`,
  }).from(subscriptions).innerJoin(owners, eq(owners.id, subscriptions.ownerId)).innerJoin(units, eq(units.id, subscriptions.unitId)).innerJoin(compounds, eq(compounds.id, subscriptions.compoundId)).where(eq(subscriptions.id, subscriptionId));
  return row;
}

function fmtDate(d) { const [y, m, day] = String(d).split('-'); return `${day}/${m}/${y}`; }

/** Sends one reminder (template expiry_reminder or expired) and records it. kind e.g. before_3 | on_expiry | after_3 | manual */
export async function sendRenewalReminder(subscriptionId, kind, { force = false } = {}) {
  const ctx = await subscriptionContext(subscriptionId);
  if (!ctx) return null;
  if (!force) {
    const already = await db.query.subscriptionReminders.findFirst({ where: and(eq(subscriptionReminders.subscriptionId, subscriptionId), eq(subscriptionReminders.kind, kind)) });
    if (already) return { skipped: 'already_sent' };
  }
  const link = await renewalLink(subscriptionId);
  const sms = await getSetting(ctx.sub.companyId, 'sms');
  const templateKey = kind === 'on_expiry' || kind.startsWith('after_') ? 'expired' : 'expiry_reminder';
  const log = await sendSms(ctx.sub.companyId, {
    to: ctx.ownerMobile, ownerId: ctx.ownerId, templateKey, lang: sms.defaultLang,
    vars: { VehicleNumber: ctx.plates, UnitNumber: ctx.unitNumber, CompoundName: ctx.compoundName, ExpiryDate: fmtDate(ctx.sub.endDate), RenewalLink: link, OwnerName: ctx.ownerName },
  });
  await db.insert(subscriptionReminders).values({ subscriptionId, kind: force ? `manual_${Date.now()}` : kind, smsLogId: log.id });
  return { log, link };
}

/**
 * Daily job: for every active/expiring subscription that has not been renewed, send the configured reminders.
 * expiryReminderDays [3] → kind before_3 when end_date - today == 3; sendOnExpiry → on_expiry when end_date == today;
 * postExpiryReminderDays [n] → after_n when today - end_date == n.
 */
export async function runReminderAutomation(companyId) {
  const notif = await getSetting(companyId, 'notifications');
  const rows = await db.execute(sql`
    SELECT s.id, (s.end_date - CURRENT_DATE)::int AS days_left
    FROM subscriptions s
    WHERE s.company_id = ${companyId}
      AND s.status IN ('active','expiring_soon','expired')
      AND s.payment_status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status <> 'cancelled')
      AND s.end_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE + 60`).then((r) => r.rows || r);
  let sent = 0;
  for (const r of rows) {
    const kinds = [];
    if (notif.expiryReminderDays?.includes(r.days_left) && r.days_left > 0) kinds.push(`before_${r.days_left}`);
    if (notif.sendOnExpiry && r.days_left === 0) kinds.push('on_expiry');
    if (r.days_left < 0 && notif.postExpiryReminderDays?.includes(-r.days_left)) kinds.push(`after_${-r.days_left}`);
    for (const kind of kinds) { const res = await sendRenewalReminder(r.id, kind); if (res && !res.skipped) sent++; }
  }
  if (sent) await systemAudit(companyId, { action: 'automation.reminders', entityType: 'subscription', after: { sent } });
  return sent;
}
