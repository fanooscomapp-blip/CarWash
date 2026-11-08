import { db, schema } from '../db/index.js';

// Records an audit entry. `tx` lets callers include the audit row in their transaction.
export async function audit(req, { action, entityType, entityId, before, after, reason }, tx = db) {
  await tx.insert(schema.auditLogs).values({
    companyId: req.companyId,
    userId: req.user?.id ?? null,
    actorType: req.user ? 'user' : (req.owner ? 'owner' : 'system'),
    action, entityType, entityId: entityId ?? null,
    before: before ?? null, after: after ?? null, reason: reason ?? null,
    ip: req.ip,
  });
}

export async function systemAudit(companyId, { action, entityType, entityId, before, after, reason }, tx = db) {
  await tx.insert(schema.auditLogs).values({ companyId, actorType: 'system', action, entityType, entityId: entityId ?? null, before: before ?? null, after: after ?? null, reason: reason ?? null });
}
