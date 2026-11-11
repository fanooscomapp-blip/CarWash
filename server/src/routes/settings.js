import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { getAllSettings, getSetting, setSetting, maskSecrets, SETTING_DEFAULTS } from '../services/settingsService.js';
import { compact } from '../lib/util.js';
import { isConfigured, sendSms } from '../services/smsService.js';
import { normalizeMobile } from '../lib/mobile.js';
import { DEFAULT_TEMPLATES } from '../db/seed.js';

const router = Router();

router.get('/', requirePermission('settings.manage'), wrap(async (req, res) => {
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, req.companyId) });
  res.json({ company, settings: maskSecrets(await getAllSettings(req.companyId)) });
}));

const companySchema = z.object({
  name: z.string().min(1).max(200).optional(), nameAr: z.string().max(200).optional().nullable(),
  currency: z.string().min(1).max(10).optional(), timezone: z.string().min(1).max(60).optional(),
  language: z.enum(['en', 'ar']).optional(), dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
});

router.put('/company', requirePermission('settings.manage'), wrap(async (req, res) => {
  const body = companySchema.parse(req.body);
  const before = await db.query.companies.findFirst({ where: eq(schema.companies.id, req.companyId) });
  const [row] = await db.update(schema.companies).set(compact(body)).where(eq(schema.companies.id, req.companyId)).returning();
  await audit(req, { action: 'settings.company', entityType: 'company', entityId: row.id, before, after: row });
  res.json(row);
}));

const sectionSchemas = {
  general: z.object({ expiringSoonDays: z.coerce.number().int().min(1).max(90), defaultWashingDays: z.array(z.number().int().min(0).max(6)).min(1), weekStartsOn: z.number().int().min(0).max(6), dayStartHour: z.coerce.number().int().min(0).max(12).optional().default(6) }),
  bank: z.object({ bankName: z.string().max(200), accountName: z.string().max(200), accountNumber: z.string().max(60), iban: z.string().max(60), instructions: z.string().max(2000) }),
  payment: z.object({ method: z.enum(['instapay', 'bank', 'cash_only']), instapayAddress: z.string().max(120), instapayName: z.string().max(120), instapayLink: z.string().max(300).optional().default(''), instructions: z.string().max(1000), instructionsAr: z.string().max(1000) }),
  sms: z.object({ provider: z.enum(['none', 'smsmisr', 'generic']), username: z.string().max(200).optional().default(''), password: z.string().max(200).optional().default(''), senderId: z.string().max(200).optional().default(''), environment: z.enum(['live', 'test']).optional().default('live'), apiUrl: z.string().max(500).optional().default(''), apiKey: z.string().max(500).optional().default(''), defaultLang: z.enum(['ar', 'en']).optional().default('ar'), otpTemplate: z.string().max(200).optional().default(''), otpApiUrl: z.string().max(500).optional().default('') }),
  portal: z.object({ baseUrl: z.string().max(300), sessionDays: z.coerce.number().int().min(1).max(365), linkValidDays: z.coerce.number().int().min(1).max(365), selfRegistration: z.boolean().optional().default(true), joinMaxPerHour: z.coerce.number().int().min(1).max(100).optional().default(5), contactPhone: z.string().max(30).optional().default(''), contactWhatsapp: z.string().max(30).optional().default('') }),
  otp: z.object({ length: z.coerce.number().int().min(4).max(8), expiryMinutes: z.coerce.number().int().min(1).max(60), maxAttempts: z.coerce.number().int().min(1).max(20), resendCooldownSeconds: z.coerce.number().int().min(10).max(600), maxPerDay: z.coerce.number().int().min(1).max(50).optional().default(5) }),
  photos: z.object({ minBeforePhotos: z.coerce.number().int().min(1).max(10), minAfterPhotos: z.coerce.number().int().min(1).max(10), maxPhotoSizeMb: z.coerce.number().int().min(1).max(50) }),
  notifications: z.object({ expiryReminderDays: z.array(z.number().int().min(1).max(60)), sendOnExpiry: z.boolean(), postExpiryReminderDays: z.array(z.number().int().min(1).max(60)), notifyAdminOnPendingPayment: z.boolean(), notifyAdminOnIssue: z.boolean(), smsOnPaymentApproved: z.boolean(), smsOnPaymentRejected: z.boolean(), smsOnWashCompleted: z.boolean(), smsOnRenewalReceived: z.boolean().optional().default(true), smsOnRegistrationApproved: z.boolean().optional().default(true), reminderHour: z.coerce.number().int().min(0).max(23).optional().default(10) }),
  paymentMethods: z.array(z.string().min(1).max(40)).min(1),
  assignment: z.object({ enabled: z.boolean(), assignHour: z.coerce.number().int().min(0).max(23), preferLastWasher: z.boolean(), maxPerStaffPerDay: z.coerce.number().int().min(0).max(200), defaultCapacity: z.coerce.number().int().min(1).max(500).optional().default(32), publishUnassignedToPool: z.boolean(), clusterByLocation: z.boolean().optional().default(true) }),
  outcomes: z.array(z.object({ key: z.string().min(1).max(30).regex(/^[a-z_]+$/), icon: z.string().max(30), labelAr: z.string().min(1).max(100), labelEn: z.string().min(1).max(100), consumesQuota: z.boolean(), requiresPhoto: z.boolean() })).min(1).max(12),
};

// Send a real test message through the configured provider (nothing is simulated)
router.post('/sms/test', requirePermission('settings.manage'), wrap(async (req, res) => {
  const { mobile, message, otp } = z.object({ mobile: z.string().min(6), message: z.string().max(300).optional(), otp: z.boolean().optional() }).parse(req.body);
  const cfg = await getSetting(req.companyId, 'sms');
  const body = message || (cfg.defaultLang === 'ar' ? 'رسالة تجريبية من نظام غسيل السيارات' : 'Test message from Car Wash Management');
  // otp:true exercises the real OTP path (SMS Misr OTP template when configured) with a random code
  const log = otp
    ? await sendSms(req.companyId, { to: normalizeMobile(mobile), templateKey: 'otp', vars: { Code: String(Math.floor(100000 + Math.random() * 900000)), Minutes: 5 }, lang: cfg.defaultLang })
    : await sendSms(req.companyId, { to: normalizeMobile(mobile), body, lang: cfg.defaultLang });
  await audit(req, { action: 'settings.sms_test', entityType: 'settings', after: { to: log.toMobile, status: log.status } });
  res.json(log);
}));

// ───── SMS templates ─────
router.get('/sms-templates', requirePermission('sms.view', 'settings.manage'), wrap(async (req, res) => {
  const rows = await db.select().from(schema.smsTemplates).where(eq(schema.smsTemplates.companyId, req.companyId)).orderBy(schema.smsTemplates.key, schema.smsTemplates.lang);
  res.json({ templates: rows, placeholders: ['OwnerName', 'VehicleNumber', 'UnitNumber', 'CompoundName', 'ExpiryDate', 'RenewalLink', 'RenewalId', 'Reason', 'RemainingWashes', 'Code', 'Minutes', 'Amount', 'PlanName'] });
}));
router.put('/sms-templates/:id', requirePermission('sms.send', 'settings.manage'), wrap(async (req, res) => {
  const body = z.object({ body: z.string().min(1).max(1000), isActive: z.boolean().optional() }).parse(req.body);
  const before = await db.query.smsTemplates.findFirst({ where: and(eq(schema.smsTemplates.id, req.params.id), eq(schema.smsTemplates.companyId, req.companyId)) });
  if (!before) throw badRequest('Template not found');
  const [row] = await db.update(schema.smsTemplates).set({ ...compact(body), updatedAt: new Date() }).where(eq(schema.smsTemplates.id, before.id)).returning();
  await audit(req, { action: 'sms.template_update', entityType: 'sms_template', entityId: row.id, before: { body: before.body }, after: { body: row.body } });
  res.json(row);
}));

router.post('/sms-templates/:id/reset', requirePermission('sms.send', 'settings.manage'), wrap(async (req, res) => {
  const before = await db.query.smsTemplates.findFirst({ where: and(eq(schema.smsTemplates.id, req.params.id), eq(schema.smsTemplates.companyId, req.companyId)) });
  if (!before) throw badRequest('Template not found');
  const def = DEFAULT_TEMPLATES.find(([k, l]) => k === before.key && l === before.lang);
  if (!def) throw badRequest('No default for this template');
  const [row] = await db.update(schema.smsTemplates).set({ body: def[2], updatedAt: new Date() }).where(eq(schema.smsTemplates.id, before.id)).returning();
  await audit(req, { action: 'sms.template_reset', entityType: 'sms_template', entityId: row.id, before: { body: before.body }, after: { body: row.body } });
  res.json(row);
}));

router.put('/:section', requirePermission('settings.manage'), wrap(async (req, res) => {
  const section = req.params.section;
  const sch = sectionSchemas[section];
  if (!sch) throw badRequest('Unknown settings section');
  let value = sch.parse(req.body);
  const before = await getSetting(req.companyId, section);
  if (section === 'sms') {
    // Keep stored secrets when the client sends back the masked placeholders
    if (value.apiKey?.startsWith('••••')) value.apiKey = before.apiKey;
    if (value.password?.startsWith('••••')) value.password = before.password;
    value.configured = isConfigured(value);
  }
  if (section === 'portal' && value.baseUrl) value.baseUrl = value.baseUrl.replace(/\/$/, '');
  await setSetting(req.companyId, section, value);
  await audit(req, { action: `settings.${section}`, entityType: 'settings', before: maskSecrets({ [section]: before })[section], after: maskSecrets({ [section]: value })[section] });
  res.json(maskSecrets({ [section]: value })[section]);
}));


export default router;
