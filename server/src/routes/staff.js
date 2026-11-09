import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq, sql, desc, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, validationFailed, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { businessToday, addDays, nextCode } from '../lib/util.js';
import { reassignAbsent, distributeAll, distributeCompound, availableStaff, eligibleVehicles } from '../services/assignmentService.js';

import { getSetting } from '../services/settingsService.js';
const router = Router();
const { users, staffLeaves, staffCompounds, washingTasks, roles, assignmentRuns } = schema;
const rows = (r) => r.rows || r;
const bizToday = async (companyId) => businessToday((await getSetting(companyId, 'general')).dayStartHour);

// ───── Staff list with schedule, leaves, today's status ─────
router.get('/', requirePermission('staff.view'), wrap(async (req, res) => {
  const d = await bizToday(req.companyId);
  const list = rows(await db.execute(sql`
    SELECT u.id, u.name, u.mobile, u.employee_code, u.is_active, u.work_days, u.work_hours_per_day, u.daily_capacity, u.date_joined, (u.pin_hash IS NOT NULL) AS has_pin,
      (SELECT json_agg(json_build_object('id', c.id, 'name', c.name)) FROM staff_compounds sc JOIN compounds c ON c.id = sc.compound_id WHERE sc.user_id = u.id) AS compounds,
      (SELECT json_agg(json_build_object('id', l.id, 'startDate', l.start_date::text, 'endDate', l.end_date::text, 'reason', l.reason) ORDER BY l.start_date) FROM staff_leaves l WHERE l.user_id = u.id AND l.end_date >= CURRENT_DATE - 30) AS leaves,
      EXISTS (SELECT 1 FROM staff_leaves l WHERE l.user_id = u.id AND ${d}::date BETWEEN l.start_date AND l.end_date) AS on_leave_today,
      (SELECT count(*) FROM washing_tasks t WHERE t.assigned_to = u.id AND t.scheduled_date = ${d} AND t.status <> 'cancelled')::int AS tasks_today,
      (SELECT count(*) FROM washing_tasks t WHERE t.assigned_to = u.id AND t.scheduled_date = ${d} AND t.status = 'completed')::int AS done_today
    FROM users u WHERE u.company_id = ${req.companyId} AND u.user_type = 'staff' ORDER BY u.is_active DESC, u.name`));
  res.json(list);
}));

const staffSchema = z.object({
  name: z.string().min(1).max(150), mobile: z.string().max(30).optional().nullable(), employeeCode: z.string().min(1).max(40),
  pin: z.string().regex(/^\d{4,6}$/).optional(), compoundIds: z.array(z.string().uuid()).min(1), workDays: z.array(z.number().int().min(0).max(6)).min(1), workHoursPerDay: z.coerce.number().min(0).max(24).optional().nullable(), dailyCapacity: z.coerce.number().int().min(1).max(500).optional().nullable(),
  isActive: z.boolean().optional(), dateJoined: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

router.post('/', requirePermission('staff.manage'), wrap(async (req, res) => {
  const body = staffSchema.parse(req.body);
  if (!body.pin) throw validationFailed('A PIN (4–6 digits) is required for a new staff member');
  const role = await db.query.roles.findFirst({ where: and(eq(roles.companyId, req.companyId), eq(roles.name, 'Car Wash Staff')) });
  const dup = await db.query.users.findFirst({ where: and(eq(users.companyId, req.companyId), eq(users.employeeCode, body.employeeCode)) });
  if (dup) throw badRequest(`Employee code ${body.employeeCode} is already used`);
  const row = await db.transaction(async (t) => {
    const [u] = await t.insert(users).values({ companyId: req.companyId, roleId: role.id, name: body.name, email: `${body.employeeCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@staff.local`, mobile: body.mobile || null, passwordHash: await bcrypt.hash(crypto.randomUUID(), 8), pinHash: await bcrypt.hash(body.pin, 8), userType: 'staff', employeeCode: body.employeeCode, workDays: body.workDays, workHoursPerDay: body.workHoursPerDay ?? null, dailyCapacity: body.dailyCapacity ?? null, isActive: body.isActive ?? true, dateJoined: body.dateJoined || await bizToday(req.companyId) }).returning();
    await t.insert(staffCompounds).values(body.compoundIds.map((compoundId) => ({ userId: u.id, compoundId })));
    await audit(req, { action: 'staff.create', entityType: 'user', entityId: u.id, after: { name: u.name, employeeCode: u.employeeCode, compoundIds: body.compoundIds, workDays: body.workDays } }, t);
    return u;
  });
  res.status(201).json({ id: row.id });
}));

router.put('/:id', requirePermission('staff.manage'), wrap(async (req, res) => {
  const body = staffSchema.partial().parse(req.body);
  const before = await db.query.users.findFirst({ where: and(eq(users.id, req.params.id), eq(users.companyId, req.companyId), eq(users.userType, 'staff')) });
  if (!before) throw notFound('Staff member');
  const { pin, compoundIds, ...rest } = body;
  const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (pin) patch.pinHash = await bcrypt.hash(pin, 8);
  await db.transaction(async (t) => {
    await t.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, before.id));
    if (compoundIds) { await t.delete(staffCompounds).where(eq(staffCompounds.userId, before.id)); await t.insert(staffCompounds).values(compoundIds.map((compoundId) => ({ userId: before.id, compoundId }))); }
    await audit(req, { action: 'staff.update', entityType: 'user', entityId: before.id, before: { name: before.name, workDays: before.workDays, isActive: before.isActive }, after: { ...patch, pinHash: undefined, pinChanged: !!pin, compoundIds } }, t);
  });
  res.json({ ok: true });
}));

// ───── Leaves ─────
const leaveSchema = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().max(200).optional() });
router.post('/:id/leaves', requirePermission('staff.manage'), wrap(async (req, res) => {
  const body = leaveSchema.parse(req.body);
  if (body.endDate < body.startDate) throw validationFailed('End date is before start date');
  const u = await db.query.users.findFirst({ where: and(eq(users.id, req.params.id), eq(users.companyId, req.companyId)) });
  if (!u) throw notFound('Staff member');
  const [leave] = await db.insert(staffLeaves).values({ userId: u.id, startDate: body.startDate, endDate: body.endDate, reason: body.reason || null, createdBy: req.user.id }).returning();
  // Re-distribute already-assigned tasks on the leave days (today/tomorrow are the ones that typically exist)
  const moves = [];
  for (let d = body.startDate; d <= body.endDate && d <= addDays(await bizToday(req.companyId), 7); d = addDays(d, 1)) { const r = await reassignAbsent(req.companyId, u.id, d, { createdBy: req.user.id, reason: body.reason || 'leave' }); if (r.total) moves.push({ date: d, ...r }); }
  await audit(req, { action: 'staff.leave_add', entityType: 'user', entityId: u.id, after: { ...body, moves } });
  res.status(201).json({ leave, moves });
}));

router.delete('/:id/leaves/:leaveId', requirePermission('staff.manage'), wrap(async (req, res) => {
  const l = await db.query.staffLeaves.findFirst({ where: and(eq(staffLeaves.id, req.params.leaveId), eq(staffLeaves.userId, req.params.id)) });
  if (!l) throw notFound('Leave');
  await db.delete(staffLeaves).where(eq(staffLeaves.id, l.id));
  await audit(req, { action: 'staff.leave_remove', entityType: 'user', entityId: req.params.id, before: l });
  res.json({ ok: true });
}));

// One-tap: absent today (creates a one-day leave and moves tasks)
router.post('/:id/absent-today', requirePermission('staff.manage'), wrap(async (req, res) => {
  const u = await db.query.users.findFirst({ where: and(eq(users.id, req.params.id), eq(users.companyId, req.companyId)) });
  if (!u) throw notFound('Staff member');
  const d = await bizToday(req.companyId);
  const exists = await db.query.staffLeaves.findFirst({ where: and(eq(staffLeaves.userId, u.id), sql`${d} BETWEEN ${staffLeaves.startDate} AND ${staffLeaves.endDate}`) });
  if (!exists) await db.insert(staffLeaves).values({ userId: u.id, startDate: d, endDate: d, reason: 'Absent (emergency)', createdBy: req.user.id });
  const r = await reassignAbsent(req.companyId, u.id, d, { createdBy: req.user.id, reason: 'absent' });
  await audit(req, { action: 'staff.absent_today', entityType: 'user', entityId: u.id, after: r });
  res.json(r);
}));

// ───── Assignment board ─────
router.get('/board', requirePermission('operations.view'), wrap(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : await bizToday(req.companyId);
  const compoundId = req.query.compoundId || null;
  const tasks = rows(await db.execute(sql`
    SELECT t.id, t.task_code, t.status, t.outcome, t.assigned_to, t.is_published, t.assigned_by, t.compound_id, c.name AS compound_name,
      v.id AS vehicle_id, v.plate_number, v.brand, v.model, v.color, v.vehicle_type, v.parking_location, v.gps_lat, v.gps_lng, un.unit_number, o.name AS owner_name,
      s.washes_allowed, s.washes_used, op.start_time, op.end_time,
      (SELECT count(*) FROM wash_photos p JOIN washing_operations o2 ON o2.id = p.operation_id WHERE o2.task_id = t.id)::int AS photos
    FROM washing_tasks t JOIN vehicles v ON v.id = t.vehicle_id JOIN compounds c ON c.id = t.compound_id JOIN units un ON un.id = v.unit_id JOIN owners o ON o.id = v.owner_id
    JOIN subscriptions s ON s.id = t.subscription_id LEFT JOIN washing_operations op ON op.task_id = t.id
    WHERE t.company_id = ${req.companyId} AND t.scheduled_date = ${date} ${compoundId ? sql`AND t.compound_id = ${compoundId}` : sql``} AND t.status <> 'cancelled'
    ORDER BY c.name, v.plate_number`));
  const staff = rows(await db.execute(sql`
    SELECT u.id, u.name, u.employee_code, u.work_days, u.daily_capacity,
      (SELECT json_agg(sc.compound_id) FROM staff_compounds sc WHERE sc.user_id = u.id) AS compound_ids,
      EXISTS (SELECT 1 FROM staff_leaves l WHERE l.user_id = u.id AND ${date} BETWEEN l.start_date AND l.end_date) AS on_leave,
      (u.work_days @> ${JSON.stringify([new Date(date + 'T00:00:00Z').getUTCDay()])}::jsonb) AS works_today
    FROM users u WHERE u.company_id = ${req.companyId} AND u.user_type = 'staff' AND u.is_active = true ORDER BY u.name`));
  const runs = rows(await db.execute(sql`SELECT r.id, r.trigger, r.summary, r.created_at AS "createdAt", c.name AS compound_name FROM assignment_runs r LEFT JOIN compounds c ON c.id = r.compound_id WHERE r.company_id = ${req.companyId} AND r.for_date = ${date} ORDER BY r.created_at DESC LIMIT 8`));
  // How many eligible vehicles are still without a task (per compound) – tells the admin whether to redistribute
  const cps = compoundId ? [{ id: compoundId }] : rows(await db.execute(sql`SELECT id, name FROM compounds WHERE company_id = ${req.companyId} AND status = 'active'`));
  const pending = []; for (const c of cps) { const e = await eligibleVehicles(req.companyId, c.id, date); if (e.length) pending.push({ compoundId: c.id, compoundName: c.name, count: e.length }); }
  const cfg = await getSetting(req.companyId, 'assignment');
  res.json({ date, today: await bizToday(req.companyId), tasks, staff, runs, pendingEligible: pending, defaultCapacity: cfg.defaultCapacity || null });
}));

// Task detail for the admin board: operation times, staff, photos (before/after), outcome
router.get('/board/tasks/:taskId', requirePermission('operations.view'), wrap(async (req, res) => {
  const [task] = rows(await db.execute(sql`
    SELECT t.id, t.task_code, t.status, t.outcome, t.outcome_note, t.cancel_reason, t.scheduled_date::text AS date, t.assigned_by, c.name AS compound_name,
      v.id AS vehicle_id, v.plate_number, v.brand, v.model, v.color, v.vehicle_type, v.parking_location, v.gps_lat, v.gps_lng, un.unit_number, o.name AS owner_name, o.mobile AS owner_mobile,
      u.name AS staff_name, op.start_time, op.end_time, op.notes, op.issue_description, op.quota_consumed, op.start_lat, op.start_lng,
      (SELECT json_agg(json_build_object('id', p.id, 'phase', p.phase, 'takenAt', p.taken_at) ORDER BY p.created_at) FROM wash_photos p WHERE p.operation_id = op.id) AS photos
    FROM washing_tasks t JOIN vehicles v ON v.id = t.vehicle_id JOIN compounds c ON c.id = t.compound_id JOIN units un ON un.id = v.unit_id JOIN owners o ON o.id = v.owner_id
    LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN washing_operations op ON op.task_id = t.id
    WHERE t.id = ${req.params.taskId} AND t.company_id = ${req.companyId}`));
  if (!task) throw notFound('Task');
  res.json(task);
}));

router.post('/board/distribute', requirePermission('operations.manage'), wrap(async (req, res) => {
  const { date, compoundId } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), compoundId: z.string().uuid().optional() }).parse(req.body);
  const result = compoundId ? [await distributeCompound(req.companyId, compoundId, date, { trigger: 'manual', createdBy: req.user.id })] : await distributeAll(req.companyId, date, { trigger: 'manual', createdBy: req.user.id });
  await audit(req, { action: 'assignment.manual', entityType: 'washing_task', after: { date, result } });
  res.json(result);
}));

router.post('/board/tasks/:taskId/assign', requirePermission('operations.manage'), wrap(async (req, res) => {
  const { userId } = z.object({ userId: z.string().uuid().nullable() }).parse(req.body);
  const task = await db.query.washingTasks.findFirst({ where: and(eq(washingTasks.id, req.params.taskId), eq(washingTasks.companyId, req.companyId)) });
  if (!task) throw notFound('Task');
  if (['completed', 'in_progress'].includes(task.status)) throw badRequest('A task that has started cannot be reassigned');
  if (userId) {
    const u = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.companyId, req.companyId), eq(users.userType, 'staff')) });
    if (!u) throw notFound('Staff member');
  }
  await db.update(washingTasks).set({ assignedTo: userId, isPublished: !userId, assignedBy: 'admin', status: 'assigned', updatedAt: new Date() }).where(eq(washingTasks.id, task.id));
  await audit(req, { action: 'task.reassign', entityType: 'washing_task', entityId: task.id, before: { assignedTo: task.assignedTo }, after: { assignedTo: userId } });
  res.json({ ok: true });
}));

router.post('/board/tasks/:taskId/cancel', requirePermission('operations.manage'), wrap(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
  const task = await db.query.washingTasks.findFirst({ where: and(eq(washingTasks.id, req.params.taskId), eq(washingTasks.companyId, req.companyId)) });
  if (!task) throw notFound('Task');
  if (task.status === 'completed') throw badRequest('Completed tasks cannot be cancelled');
  await db.update(washingTasks).set({ status: 'cancelled', cancelReason: reason, updatedAt: new Date() }).where(eq(washingTasks.id, task.id));
  await audit(req, { action: 'task.cancel', entityType: 'washing_task', entityId: task.id, reason });
  res.json({ ok: true });
}));

// Add a single vehicle task manually (e.g. extra wash the admin wants done today)
router.post('/board/tasks', requirePermission('operations.manage'), wrap(async (req, res) => {
  const { vehicleId, date, userId } = z.object({ vehicleId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), userId: z.string().uuid().nullable().optional() }).parse(req.body);
  const [v] = rows(await db.execute(sql`SELECT v.id AS vehicle_id, v.compound_id, s.id AS subscription_id FROM vehicles v JOIN subscription_vehicles sv ON sv.vehicle_id = v.id JOIN subscriptions s ON s.id = sv.subscription_id
    WHERE v.id = ${vehicleId} AND v.company_id = ${req.companyId} AND s.payment_status = 'paid' AND s.status IN ('active','expiring_soon') AND s.start_date <= ${date} AND s.end_date >= ${date} AND s.washes_used < s.washes_allowed LIMIT 1`));
  if (!v) throw validationFailed('Vehicle has no paid subscription with remaining washes covering that date');
  const dup = await db.query.washingTasks.findFirst({ where: and(eq(washingTasks.vehicleId, vehicleId), eq(washingTasks.scheduledDate, date), sql`${washingTasks.status} <> 'cancelled'`) });
  if (dup) throw badRequest('This vehicle already has a task on that date');
  const taskCode = await nextCode(req.companyId, 'task', 'TSK');
  const [task] = await db.insert(washingTasks).values({ companyId: req.companyId, taskCode, compoundId: v.compound_id, vehicleId, subscriptionId: v.subscription_id, scheduledDate: date, assignedTo: userId || null, isPublished: !userId, status: 'assigned', assignedBy: 'admin', createdBy: req.user.id }).returning();
  await audit(req, { action: 'task.create', entityType: 'washing_task', entityId: task.id, after: task });
  res.status(201).json(task);
}));

export default router;
