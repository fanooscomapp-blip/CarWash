import cron from 'node-cron';
import { sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { refreshStatuses } from './subscriptionService.js';
import { systemAudit } from '../lib/audit.js';
import { runReminderAutomation } from './renewalLinkService.js';

// Nightly automation: recompute subscription statuses for every company and raise in-app notices for newly expiring/expired ones.
// SMS reminders (Phase 4) hook into the same place: smsService.sendExpiryReminders(companyId).
export async function runDailyAutomation() {
  const companies = await db.select({ id: schema.companies.id }).from(schema.companies);
  for (const { id } of companies) {
    const before = await db.execute(sql`SELECT id, status FROM subscriptions WHERE company_id = ${id}`).then((r) => r.rows || r);
    await refreshStatuses(id);
    const after = await db.execute(sql`SELECT id, status, subscription_code FROM subscriptions WHERE company_id = ${id}`).then((r) => r.rows || r);
    const changed = after.filter((a) => before.find((b) => b.id === a.id)?.status !== a.status);
    for (const c of changed) {
      if (c.status === 'expiring_soon' || c.status === 'expired') {
        await db.insert(schema.notifications).values({ companyId: id, type: `subscription.${c.status}`, title: `Subscription ${c.subscription_code} is ${c.status.replace('_', ' ')}`, entityType: 'subscription', entityId: c.id });
      }
    }
    if (changed.length) await systemAudit(id, { action: 'automation.status_refresh', entityType: 'subscription', after: { changed: changed.length } });
    await runReminderAutomation(id).catch((e) => console.error('reminder automation failed', e));
  }
}

export function startSchedulers() {
  // 00:05 every day (server time) + hourly safety refresh
  cron.schedule('5 0 * * *', () => runDailyAutomation().catch((e) => console.error('daily automation failed', e)));
  cron.schedule('0 * * * *', () => runDailyAutomation().catch((e) => console.error('hourly automation failed', e)));
}
