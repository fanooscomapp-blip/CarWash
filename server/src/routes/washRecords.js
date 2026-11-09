// Admin: record a completed wash manually with before/after photos. Phase 3 replaces this with the staff workflow
// but keeps the same tables, so everything recorded here shows up in the owner's calendar and later reports.
import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, validationFailed, conflict } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { nextCode, today } from '../lib/util.js';
import { makeUploader, storageKey } from '../lib/uploads.js';
import { storeUpload, sendStored } from '../lib/storage.js';

const router = Router();
const { vehicles, subscriptions, subscriptionVehicles, washingTasks, washingOperations, washPhotos } = schema;
const photoUpload = makeUploader('washes', { maxMb: 10 });

// multipart: vehicleId, date, notes, before[] , after[]
router.post('/', requirePermission('operations.manage'), photoUpload.fields([{ name: 'before', maxCount: 6 }, { name: 'after', maxCount: 6 }]), wrap(async (req, res) => {
  const files = [...(req.files?.before || []), ...(req.files?.after || [])];
  try {
    const body = z.object({ vehicleId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: z.string().max(2000).optional(), startTime: z.string().optional(), endTime: z.string().optional() }).parse(req.body);
    const date = body.date || today();
    const vehicle = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, body.vehicleId), eq(vehicles.companyId, req.companyId)) });
    if (!vehicle) throw notFound('Vehicle');
    if (!(req.files?.before?.length) || !(req.files?.after?.length)) throw validationFailed('At least one before photo and one after photo are required');
    // Subscription covering the date
    const [sub] = await db.select({ s: subscriptions }).from(subscriptions).innerJoin(subscriptionVehicles, eq(subscriptionVehicles.subscriptionId, subscriptions.id))
      .where(and(eq(subscriptionVehicles.vehicleId, vehicle.id), sql`${subscriptions.startDate} <= ${date} AND ${subscriptions.endDate} >= ${date}`, eq(subscriptions.paymentStatus, 'paid'), sql`${subscriptions.status} NOT IN ('cancelled','suspended')`)).limit(1);
    if (!sub) throw validationFailed('No paid subscription covers this vehicle on that date');
    const result = await db.transaction(async (t) => {
      const [locked] = await t.select().from(subscriptions).where(eq(subscriptions.id, sub.s.id)).for('update');
      if (locked.washesUsed >= locked.washesAllowed) throw conflict(`Washing allowance exhausted (${locked.washesUsed}/${locked.washesAllowed})`);
      const dup = await t.query.washingTasks.findFirst({ where: and(eq(washingTasks.vehicleId, vehicle.id), eq(washingTasks.scheduledDate, date), sql`${washingTasks.status} <> 'cancelled'`) });
      if (dup) throw conflict('A wash is already recorded for this vehicle on that date');
      const taskCode = await nextCode(req.companyId, 'task', 'TSK', t);
      const [task] = await t.insert(washingTasks).values({ companyId: req.companyId, taskCode, compoundId: vehicle.compoundId, vehicleId: vehicle.id, subscriptionId: locked.id, scheduledDate: date, assignedTo: null, status: 'completed', createdBy: req.user.id }).returning();
      const start = body.startTime ? new Date(body.startTime) : new Date(date + 'T09:00:00'); const end = body.endTime ? new Date(body.endTime) : new Date(start.getTime() + 30 * 60000);
      const [op] = await t.insert(washingOperations).values({ companyId: req.companyId, taskId: task.id, vehicleId: vehicle.id, subscriptionId: locked.id, staffId: req.user.id, startTime: start, endTime: end, notes: body.notes || null, status: 'completed', quotaConsumed: true, adminReviewedBy: req.user.id, adminReviewedAt: new Date() }).returning();
      for (const phase of ['before', 'after']) for (const f of req.files[phase] || []) {
        const key = await storeUpload(f.path, storageKey('washes', f), f.mimetype);
        await t.insert(washPhotos).values({ operationId: op.id, phase, filePath: key, mimeType: f.mimetype, takenAt: phase === 'before' ? start : end });
      }
      await t.update(subscriptions).set({ washesUsed: locked.washesUsed + 1, updatedAt: new Date() }).where(eq(subscriptions.id, locked.id));
      await audit(req, { action: 'wash.manual_record', entityType: 'washing_operation', entityId: op.id, after: { vehicleId: vehicle.id, date, subscriptionId: locked.id, washesUsed: locked.washesUsed + 1 } }, t);
      return { task, operation: op, washesUsed: locked.washesUsed + 1, washesAllowed: locked.washesAllowed };
    });
    res.status(201).json(result);
  } catch (e) { files.forEach((f) => fs.unlink(f.path, () => {})); throw e; }
}));

router.get('/vehicle/:vehicleId', requirePermission('operations.view', 'vehicles.view'), wrap(async (req, res) => {
  const rows = await db.execute(sql`SELECT t.id AS task_id, t.scheduled_date::text, t.status AS task_status, o.id AS operation_id, o.start_time, o.end_time, o.notes, o.status AS operation_status, u.name AS staff_name,
      (SELECT json_agg(json_build_object('id', p.id, 'phase', p.phase)) FROM wash_photos p WHERE p.operation_id = o.id) AS photos
    FROM washing_tasks t LEFT JOIN washing_operations o ON o.task_id = t.id LEFT JOIN users u ON u.id = o.staff_id JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.vehicle_id = ${req.params.vehicleId} AND v.company_id = ${req.companyId} ORDER BY t.scheduled_date DESC LIMIT 100`).then((r) => r.rows || r);
  res.json(rows);
}));

router.get('/photos/:photoId', requirePermission('operations.view', 'vehicles.view'), wrap(async (req, res) => {
  const [p] = await db.execute(sql`SELECT p.file_path, p.mime_type FROM wash_photos p JOIN washing_operations o ON o.id = p.operation_id WHERE p.id = ${req.params.photoId} AND o.company_id = ${req.companyId}`).then((r) => r.rows || r);
  if (!p) throw notFound('Photo');
  await sendStored(res, p.file_path, p.mime_type);
}));

export default router;
