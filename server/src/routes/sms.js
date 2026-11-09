import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, desc, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged } from '../lib/util.js';
import { sendSms, listSmsLogs, isConfigured } from '../services/smsService.js';
import { getSetting } from '../services/settingsService.js';
import { sendRenewalReminder, renewalLink } from '../services/renewalLinkService.js';
import { normalizeMobile } from '../lib/mobile.js';

const router = Router();
const { smsLogs, owners, subscriptions } = schema;

router.get('/status', requirePermission('sms.view'), wrap(async (req, res) => {
  const cfg = await getSetting(req.companyId, 'sms');
  const [counts] = await db.execute(sql`SELECT count(*) FILTER (WHERE status='sent')::int AS sent, count(*) FILTER (WHERE status='failed')::int AS failed, count(*) FILTER (WHERE status='not_configured')::int AS not_configured,
      count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last30 FROM sms_logs WHERE company_id = ${req.companyId}`).then((r) => r.rows || r);
  res.json({ provider: cfg.provider, configured: isConfigured(cfg), senderId: cfg.senderId, environment: cfg.environment, counts });
}));

router.get('/logs', requirePermission('sms.view'), wrap(async (req, res) => {
  const pg = parsePagination(req.query, { page: 1, pageSize: 50 });
  const rows = await listSmsLogs(req.companyId, { status: req.query.status, search: req.query.search, limit: pg.limit, offset: pg.offset });
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(smsLogs).where(and(eq(smsLogs.companyId, req.companyId), req.query.status ? eq(smsLogs.status, req.query.status) : undefined));
  res.json(paged(rows, count, pg));
}));

// Single or bulk free-text message
router.post('/send', requirePermission('sms.send'), wrap(async (req, res) => {
  const body = z.object({
    message: z.string().min(1).max(600),
    mobiles: z.array(z.string().min(6)).optional(),
    ownerIds: z.array(z.string().uuid()).optional(),
    compoundId: z.string().uuid().optional(),          // bulk: every owner with a unit in this compound
    subscriptionStatuses: z.array(z.string()).optional(), // bulk filter by current subscription status
  }).parse(req.body);
  const targets = new Map(); // mobile → ownerId
  (body.mobiles || []).forEach((m) => targets.set(normalizeMobile(m), null));
  if (body.ownerIds?.length) (await db.select({ id: owners.id, mobile: owners.mobile }).from(owners).where(inArray(owners.id, body.ownerIds))).forEach((o) => targets.set(o.mobile, o.id));
  if (body.compoundId || body.subscriptionStatuses?.length) {
    const rows = await db.execute(sql`SELECT DISTINCT o.id, o.mobile FROM owners o
      JOIN units u ON u.owner_id = o.id ${body.compoundId ? sql`AND u.compound_id = ${body.compoundId}` : sql``}
      WHERE o.company_id = ${req.companyId}
      ${body.subscriptionStatuses?.length ? sql`AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.owner_id = o.id AND s.status IN (${sql.join(body.subscriptionStatuses.map((x) => sql`${x}`), sql`, `)}))` : sql``}`).then((r) => r.rows || r);
    rows.forEach((o) => targets.set(o.mobile, o.id));
  }
  const results = [];
  for (const [mobile, ownerId] of targets) results.push(await sendSms(req.companyId, { to: mobile, ownerId, body: body.message }));
  await audit(req, { action: 'sms.send', entityType: 'sms', after: { recipients: results.length, sent: results.filter((r) => r.status === 'sent').length } });
  res.json({ total: results.length, sent: results.filter((r) => r.status === 'sent').length, failed: results.filter((r) => r.status === 'failed').length, notConfigured: results.filter((r) => r.status === 'not_configured').length, results });
}));

// Renewal link for a subscription (copy to clipboard / send via WhatsApp manually)
router.get('/renewal-link/:subscriptionId', requirePermission('subscriptions.view'), wrap(async (req, res) => {
  const sub = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, req.params.subscriptionId), eq(subscriptions.companyId, req.companyId)) });
  if (!sub) throw notFound('Subscription');
  res.json({ link: await renewalLink(sub.id) });
}));

// Send the renewal reminder SMS now (manual)
router.post('/renewal-reminder/:subscriptionId', requirePermission('sms.send', 'subscriptions.renew'), wrap(async (req, res) => {
  const sub = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, req.params.subscriptionId), eq(subscriptions.companyId, req.companyId)) });
  if (!sub) throw notFound('Subscription');
  const result = await sendRenewalReminder(sub.id, 'manual', { force: true });
  await audit(req, { action: 'sms.renewal_reminder', entityType: 'subscription', entityId: sub.id, after: { status: result.log?.status } });
  res.json(result);
}));

export default router;
