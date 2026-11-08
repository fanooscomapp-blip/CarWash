import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { getAllSettings, getSetting, setSetting, maskSecrets, SETTING_DEFAULTS } from '../services/settingsService.js';
import { compact } from '../lib/util.js';

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
  general: z.object({ expiringSoonDays: z.coerce.number().int().min(1).max(90), defaultWashingDays: z.array(z.number().int().min(0).max(6)).min(1), weekStartsOn: z.number().int().min(0).max(6) }),
  bank: z.object({ bankName: z.string().max(200), accountName: z.string().max(200), accountNumber: z.string().max(60), iban: z.string().max(60), instructions: z.string().max(2000) }),
  sms: z.object({ provider: z.string().max(60), apiUrl: z.string().max(500), apiKey: z.string().max(500), senderId: z.string().max(60) }),
  otp: z.object({ length: z.coerce.number().int().min(4).max(8), expiryMinutes: z.coerce.number().int().min(1).max(60), maxAttempts: z.coerce.number().int().min(1).max(20), resendCooldownSeconds: z.coerce.number().int().min(10).max(600) }),
  photos: z.object({ minBeforePhotos: z.coerce.number().int().min(1).max(10), minAfterPhotos: z.coerce.number().int().min(1).max(10), maxPhotoSizeMb: z.coerce.number().int().min(1).max(50) }),
  notifications: z.object({ expiryReminderDays: z.array(z.number().int().min(0).max(60)), postExpiryReminderDays: z.array(z.number().int().min(1).max(60)), notifyAdminOnPendingPayment: z.boolean(), notifyAdminOnIssue: z.boolean() }),
  paymentMethods: z.array(z.string().min(1).max(40)).min(1),
};

router.put('/:section', requirePermission('settings.manage'), wrap(async (req, res) => {
  const section = req.params.section;
  const sch = sectionSchemas[section];
  if (!sch) throw badRequest('Unknown settings section');
  let value = sch.parse(req.body);
  const before = await getSetting(req.companyId, section);
  if (section === 'sms') {
    // Keep the stored key when the client sends back the masked placeholder
    if (value.apiKey.startsWith('••••')) value.apiKey = before.apiKey;
    value.configured = !!(value.provider && value.provider !== 'none' && value.apiUrl && value.apiKey);
  }
  await setSetting(req.companyId, section, value);
  await audit(req, { action: `settings.${section}`, entityType: 'settings', before: maskSecrets({ [section]: before })[section], after: maskSecrets({ [section]: value })[section] });
  res.json(maskSecrets({ [section]: value })[section]);
}));

export default router;
