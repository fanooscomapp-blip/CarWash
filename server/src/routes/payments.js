import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import { and, eq, sql, or, getTableColumns, desc, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, ilike } from '../lib/util.js';
import { approvePayment, rejectPayment } from '../services/subscriptionService.js';
import { makeUploader, storageKey } from '../lib/uploads.js';
import { storeUpload, sendStored } from '../lib/storage.js';

const router = Router();
const { payments, paymentReceipts, subscriptions, owners, compounds, units } = schema;
const receiptUpload = makeUploader('receipts', { maxMb: 10, allowPdf: true });

const listSelect = () => ({
  ...getTableColumns(payments),
  subscriptionCode: subscriptions.subscriptionCode, subscriptionStatus: subscriptions.status, planName: sql`${subscriptions.planSnapshot}->>'name'`,
  ownerName: owners.name, ownerMobile: owners.mobile, compoundName: compounds.name, unitNumber: units.unitNumber,
  plates: sql`(SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = ${subscriptions.id})`,
  receiptsCount: sql`(SELECT count(*) FROM payment_receipts r WHERE r.payment_id = ${payments.id})`.mapWith(Number),
  approvedByName: sql`(SELECT u.name FROM users u WHERE u.id = ${payments.approvedBy})`,
});
const joined = (q) => q.from(payments).innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId)).innerJoin(owners, eq(owners.id, payments.ownerId))
  .innerJoin(compounds, eq(compounds.id, payments.compoundId)).innerJoin(units, eq(units.id, subscriptions.unitId));

router.get('/', requirePermission('payments.view'), wrap(async (req, res) => {
  const { status, compoundId, method, search, dateFrom, dateTo } = req.query;
  const pg = parsePagination(req.query);
  const statuses = status ? String(status).split(',') : [];
  const where = and(
    eq(payments.companyId, req.companyId),
    statuses.length ? inArray(payments.status, statuses) : undefined,
    compoundId ? eq(payments.compoundId, compoundId) : undefined,
    method ? eq(payments.method, method) : undefined,
    dateFrom ? sql`${payments.createdAt} >= ${dateFrom}::date` : undefined,
    dateTo ? sql`${payments.createdAt} < (${dateTo}::date + 1)` : undefined,
    search ? or(ilike(payments.paymentCode, search), ilike(subscriptions.subscriptionCode, search), ilike(owners.name, search), ilike(owners.mobile, search)) : undefined,
  );
  const rows = await joined(db.select(listSelect())).where(where).orderBy(desc(payments.createdAt)).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await joined(db.select({ count: sql`count(*)`.mapWith(Number) })).where(where);
  const totals = await db.execute(sql`SELECT
      coalesce(sum(amount) FILTER (WHERE status='approved'),0)::numeric AS approved,
      coalesce(sum(amount) FILTER (WHERE status IN ('pending_verification','awaiting_new_receipt')),0)::numeric AS outstanding,
      count(*) FILTER (WHERE status='pending_verification')::int AS pending_count
    FROM payments WHERE company_id = ${req.companyId}
      ${compoundId ? sql`AND compound_id = ${compoundId}` : sql``}
      ${method ? sql`AND method = ${method}` : sql``}
      ${dateFrom ? sql`AND created_at >= ${dateFrom}::date` : sql``}
      ${dateTo ? sql`AND created_at < (${dateTo}::date + 1)` : sql``}`).then((r) => (r.rows || r)[0]);
  res.json({ ...paged(rows, count, pg), totals });
}));

router.get('/:id', requirePermission('payments.view'), wrap(async (req, res) => {
  const [row] = await joined(db.select(listSelect())).where(and(eq(payments.id, req.params.id), eq(payments.companyId, req.companyId)));
  if (!row) throw notFound('Payment');
  const receipts = await db.select().from(paymentReceipts).where(eq(paymentReceipts.paymentId, row.id)).orderBy(desc(paymentReceipts.uploadedAt));
  res.json({ ...row, receipts });
}));

router.post('/:id/approve', requirePermission('payments.approve'), wrap(async (req, res) => {
  const { notes } = z.object({ notes: z.string().max(2000).optional() }).parse(req.body || {});
  res.json(await approvePayment(req, req.params.id, notes));
}));

router.post('/:id/reject', requirePermission('payments.approve'), wrap(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(1).max(2000) }).parse(req.body || {});
  res.json(await rejectPayment(req, req.params.id, reason));
}));

// Admin-side receipt upload (owner-side upload arrives in Phase 2 through the owner portal)
router.post('/:id/receipts', requirePermission('payments.approve', 'subscriptions.manage'), receiptUpload.single('receipt'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded');
  const payment = await db.query.payments.findFirst({ where: and(eq(payments.id, req.params.id), eq(payments.companyId, req.companyId)) });
  if (!payment) { fs.unlink(req.file.path, () => {}); throw notFound('Payment'); }
  const filePath = await storeUpload(req.file.path, storageKey('receipts', req.file), req.file.mimetype);
  const [receipt] = await db.insert(paymentReceipts).values({ paymentId: payment.id, filePath, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, uploadedByType: 'admin' }).returning();
  if (payment.status === 'awaiting_new_receipt') await db.update(payments).set({ status: 'pending_verification', updatedAt: new Date() }).where(eq(payments.id, payment.id));
  await audit(req, { action: 'payment.receipt_upload', entityType: 'payment', entityId: payment.id, after: { receiptId: receipt.id, originalName: req.file.originalname } });
  res.status(201).json(receipt);
}));

// Receipts are never public: streamed only to authenticated users with payments access
router.get('/:id/receipts/:receiptId', requirePermission('payments.view'), wrap(async (req, res) => {
  const payment = await db.query.payments.findFirst({ where: and(eq(payments.id, req.params.id), eq(payments.companyId, req.companyId)) });
  if (!payment) throw notFound('Payment');
  const receipt = await db.query.paymentReceipts.findFirst({ where: and(eq(paymentReceipts.id, req.params.receiptId), eq(paymentReceipts.paymentId, payment.id)) });
  if (!receipt) throw notFound('Receipt');
  await sendStored(res, receipt.filePath, receipt.mimeType || 'application/octet-stream');
}));

export default router;
