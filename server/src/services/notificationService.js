import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hasPermission } from '../lib/permissions.js';

// In-app notification for admins (company-wide, targetUserId null). SMS delivery lives in smsService (Phase 4).
export async function notifyAdmins(companyId, { type, title, body, entityType, entityId }, tx = db) {
  await tx.insert(schema.notifications).values({ companyId, type, title, body: body ?? null, entityType: entityType ?? null, entityId: entityId ?? null, targetUserId: null });
}

export async function listNotifications(companyId, user, { unreadOnly = false, limit = 30 } = {}) {
  const rows = await db.select().from(schema.notifications)
    .where(and(eq(schema.notifications.companyId, companyId), unreadOnly ? eq(schema.notifications.isRead, false) : sql`true`,
      sql`(${schema.notifications.targetUserId} IS NULL OR ${schema.notifications.targetUserId} = ${user.id})`))
    .orderBy(sql`${schema.notifications.createdAt} DESC`).limit(limit);
  // Admin-wide notifications about payments are only meaningful for users allowed to see payments
  return rows.filter((n) => n.targetUserId === user.id || n.type.startsWith('payment') ? hasPermission(user, 'payments.view') || n.targetUserId === user.id : true);
}

export async function markRead(companyId, ids) {
  if (!ids?.length) return;
  await db.update(schema.notifications).set({ isRead: true }).where(and(eq(schema.notifications.companyId, companyId), sql`${schema.notifications.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
}
