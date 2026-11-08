import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export const SETTING_DEFAULTS = {
  general: { expiringSoonDays: 7, defaultWashingDays: [0, 1, 2, 3, 4, 5, 6], weekStartsOn: 6 },
  bank: { bankName: '', accountName: '', accountNumber: '', iban: '', instructions: '' },
  sms: { provider: 'none', apiUrl: '', apiKey: '', senderId: '', configured: false },
  otp: { length: 6, expiryMinutes: 5, maxAttempts: 5, resendCooldownSeconds: 60 },
  photos: { minBeforePhotos: 1, minAfterPhotos: 1, maxPhotoSizeMb: 8 },
  notifications: { expiryReminderDays: [7, 3, 1, 0], postExpiryReminderDays: [3], notifyAdminOnPendingPayment: true, notifyAdminOnIssue: true },
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
  return s;
}
