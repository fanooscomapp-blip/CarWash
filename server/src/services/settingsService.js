import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export const SETTING_DEFAULTS = {
  general: { expiringSoonDays: 7, defaultWashingDays: [6, 0, 1, 2, 3, 4], weekStartsOn: 6, dayStartHour: 6 },
  // Payment collection: InstaPay (default for Egypt). Shown to owners on the renewal page.
  payment: { method: 'instapay', instapayAddress: '', instapayName: '', instapayLink: '', instructions: '', instructionsAr: '' },
  bank: { bankName: '', accountName: '', accountNumber: '', iban: '', instructions: '' },
  // SMS provider. provider: none | smsmisr | generic
  sms: { provider: 'none', username: '', password: '', senderId: '', environment: 'live', apiUrl: '', apiKey: '', configured: false, defaultLang: 'ar', otpTemplate: '', otpApiUrl: '' },
  portal: { baseUrl: '', sessionDays: 30, linkValidDays: 30, selfRegistration: true, joinMaxPerHour: 5 },
  otp: { length: 6, expiryMinutes: 5, maxAttempts: 5, resendCooldownSeconds: 60, maxPerDay: 5 },
  photos: { minBeforePhotos: 1, minAfterPhotos: 1, maxPhotoSizeMb: 8 },
  // Daily distribution: run at `assignHour` (0-23, business TZ) for the next day; fairness: even split, prefer last washer
  assignment: { enabled: true, assignHour: 20, preferLastWasher: true, maxPerStaffPerDay: 0, defaultCapacity: 32, publishUnassignedToPool: true, clusterByLocation: true },
  // Outcomes staff can pick instead of washing (key, icon, counts against quota?)
  outcomes: [
    { key: 'not_found', icon: 'car-off', labelAr: 'السيارة غير موجودة', labelEn: 'Car not found', consumesQuota: false, requiresPhoto: false },
    { key: 'locked', icon: 'lock', labelAr: 'السيارة مقفولة / رفض المالك', labelEn: 'Locked / owner refused', consumesQuota: false, requiresPhoto: false },
    { key: 'damage', icon: 'alert', labelAr: 'ضرر أو مشكلة بالسيارة', labelEn: 'Damage or issue', consumesQuota: false, requiresPhoto: true },
    { key: 'postponed', icon: 'calendar', labelAr: 'تأجيل لبكرة', labelEn: 'Postpone to tomorrow', consumesQuota: false, requiresPhoto: false },
  ],
  notifications: { expiryReminderDays: [3], sendOnExpiry: true, postExpiryReminderDays: [], notifyAdminOnPendingPayment: true, notifyAdminOnIssue: true, smsOnPaymentApproved: true, smsOnPaymentRejected: true, smsOnWashCompleted: false, smsOnRenewalReceived: true, smsOnRegistrationApproved: true, reminderHour: 10 },
  paymentMethods: ['bank_transfer', 'cash', 'other'],
};

export async function getSetting(companyId, key) {
  const row = await db.query.settings.findFirst({ where: and(eq(schema.settings.companyId, companyId), eq(schema.settings.key, key)) });
  const def = SETTING_DEFAULTS[key];
  if (!row) return def;
  return Array.isArray(def) ? row.value : { ...def, ...row.value };
}

export async function getAllSettings(companyId) {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.companyId, companyId));
  const out = {};
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    const row = rows.find((r) => r.key === key);
    const def = SETTING_DEFAULTS[key];
    out[key] = row ? (Array.isArray(def) ? row.value : { ...def, ...row.value }) : def;
  }
  return out;
}

export async function setSetting(companyId, key, value) {
  if (!(key in SETTING_DEFAULTS)) throw new Error(`Unknown setting ${key}`);
  await db.insert(schema.settings).values({ companyId, key, value })
    .onConflictDoUpdate({ target: [schema.settings.companyId, schema.settings.key], set: { value, updatedAt: new Date() } });
}

// Never return secrets to the client in full
export function maskSecrets(settings) {
  const s = structuredClone(settings);
  if (s.sms?.apiKey) s.sms.apiKey = s.sms.apiKey.length > 4 ? '••••' + s.sms.apiKey.slice(-4) : '••••';
  if (s.sms?.password) s.sms.password = '••••••••';
  return s;
}
