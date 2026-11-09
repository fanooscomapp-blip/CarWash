/**
 * Staff app API (/api/s). Field washers log in with employee code + PIN and work through today's/tomorrow's cards:
 *   start (before photos → timer starts) → finish (after photos → duration, quota consumed, owner SMS optional)
 *   or outcome (car not found / locked / damage… from settings; may or may not consume quota).
 * Photo uploads are idempotent per phase so the app can retry in the background.
 */
import { Router } from 'express';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, badRequest, unauthorized, forbidden, validationFailed, conflict } from '../lib/errors.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { today, addDays, nextCode, businessToday } from '../lib/util.js';
import { makeUploader, storageKey } from '../lib/uploads.js';
import { storeUpload, sendStored } from '../lib/storage.js';
import { getSetting } from '../services/settingsService.js';
import { sendSms } from '../services/smsService.js';
import { notifyAdmins } from '../services/notificationService.js';

const router = Router();
const { users, washingTasks, washingOperations, washPhotos, subscriptions, companies } = schema;
const rows = (r) => r.rows || r;
const upload = makeUploader('washes', { maxMb: 12 });
const photosField = upload.array('photos', 8);
const bizToday = async (companyId) => businessToday((await getSetting(companyId, 'general')).dayStartHour);
const cleanup = (files) => (files || []).forEach((f) => fs.unlink(f.path, () => {}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } } });

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { employeeCode, pin } = z.object({ employeeCode: z.string().min(1).max(40), pin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
  const candidates = await db.query.users.findMany({ where: and(sql`lower(${users.employeeCode}) = ${employeeCode.trim().toLowerCase()}`, eq(users.userType, 'staff'), eq(users.isActive, true)) });
  let user = null;
  for (const c of candidates) if (c.pinHash && (await bcrypt.compare(pin, c.pinHash))) { user = c; break; }
  if (!user) throw unauthorized('Wrong employee code or PIN');
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  req.companyId = user.companyId; req.user = { id: user.id };
  await audit(req, { action: 'auth.staff_login', entityType: 'user', entityId: user.id });
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, employeeCode: user.employeeCode } });
}));

const requireStaff = (req, _res, next) => (req.user?.userType === 'staff' ? next() : next(forbidden('Staff app only')));
router.use(authenticate, requireStaff);

router.get('/me', wrap(async (req, res) => {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, req.companyId) });
  const [outcomes, photos, assignment, general] = await Promise.all([getSetting(req.companyId, 'outcomes'), getSetting(req.companyId, 'photos'), getSetting(req.companyId, 'assignment'), getSetting(req.companyId, 'general')]);
  const d0 = businessToday(general.dayStartHour);
  const cps = rows(await db.execute(sql`SELECT c.id, c.name FROM staff_compounds sc JOIN compounds c ON c.id = sc.compound_id WHERE sc.user_id = ${req.user.id} ORDER BY c.name`));
  res.json({ user: { id: req.user.id, name: req.user.name }, company: { name: company.name, nameAr: company.nameAr, language: company.language }, compounds: cps, outcomes, photos: { minBefore: photos.minBeforePhotos, minAfter: photos.minAfterPhotos, maxMb: photos.maxPhotoSizeMb }, pool: assignment.publishUnassignedToPool !== false, today: d0, tomorrow: addDays(d0, 1), dayStartHour: general.dayStartHour });
}));

const taskSelect = (where) => sql`
  SELECT t.id, t.task_code, t.status, t.outcome, t.outcome_note, t.assigned_to, t.is_published, t.scheduled_date::text AS date, t.compound_id, c.name AS compound_name,
    v.id AS vehicle_id, v.plate_number, v.brand, v.model, v.color, v.vehicle_type, v.parking_location, v.gps_lat, v.gps_lng, un.unit_number, o.name AS owner_name,
    s.washes_allowed, s.washes_used, op.id AS operation_id, op.start_time, op.end_time,
    (SELECT json_agg(json_build_object('id', p.id, 'phase', p.phase) ORDER BY p.created_at) FROM wash_photos p WHERE p.operation_id = op.id) AS photos
  FROM washing_tasks t JOIN vehicles v ON v.id = t.vehicle_id JOIN compounds c ON c.id = t.compound_id JOIN units un ON un.id = v.unit_id JOIN owners o ON o.id = v.owner_id
  JOIN subscriptions s ON s.id = t.subscription_id LEFT JOIN washing_operations op ON op.task_id = t.id
  WHERE ${where} ORDER BY t.scheduled_date, (t.status = 'completed'), (t.status = 'skipped'), c.name, un.unit_number`;

// Today + tomorrow only: my tasks and (optionally) the unassigned pool of my compounds
router.get('/tasks', wrap(async (req, res) => {
  const d0 = await bizToday(req.companyId), d1 = addDays(d0, 1);
  const assignment = await getSetting(req.companyId, 'assignment');
  const poolSql = assignment.publishUnassignedToPool !== false ? sql`OR (t.assigned_to IS NULL AND t.is_published = true AND t.compound_id IN (SELECT compound_id FROM staff_compounds WHERE user_id = ${req.user.id}))` : sql``;
  const list = rows(await db.execute(taskSelect(sql`t.company_id = ${req.companyId} AND t.scheduled_date IN (${d0}, ${d1}) AND t.status <> 'cancelled' AND (t.assigned_to = ${req.user.id} ${poolSql})`)));
  res.json({ today: d0, tomorrow: d1, tasks: list });
}));

async function loadTask(req, id) {
  const [task] = rows(await db.execute(taskSelect(sql`t.id = ${id} AND t.company_id = ${req.companyId}`)));
  if (!task) throw notFound('Task');
  return task;
}
const ensureMine = (task, req) => { if (task.assigned_to !== req.user.id) throw forbidden('This task is assigned to someone else'); };
const ensureToday = async (task, req) => { const d = await bizToday(req.companyId); if (task.date !== d) throw badRequest(task.date > d ? 'This task is for the next day – it can be started then' : 'This task date has passed'); };

router.post('/tasks/:id/claim', wrap(async (req, res) => {
  const task = await loadTask(req, req.params.id);
  if (task.assigned_to) throw conflict('Already taken by a colleague');
  if (!req.user.compoundIds.includes(task.compound_id)) throw forbidden('Not your compound');
  const r = await db.update(washingTasks).set({ assignedTo: req.user.id, assignedBy: 'claim', isPublished: false, status: 'accepted', updatedAt: new Date() }).where(and(eq(washingTasks.id, task.id), sql`${washingTasks.assignedTo} IS NULL`)).returning({ id: washingTasks.id });
  if (!r.length) throw conflict('Already taken by a colleague');
  await audit(req, { action: 'task.claim', entityType: 'washing_task', entityId: task.id });
  res.json({ ok: true });
}));

async function savePhotos(t, operationId, phase, files, when) {
  const out = [];
  for (const f of files) {
    const key = await storeUpload(f.path, storageKey('washes', f), f.mimetype);
    const [p] = await t.insert(washPhotos).values({ operationId, phase, filePath: key, mimeType: f.mimetype, takenAt: when }).returning({ id: washPhotos.id });
    out.push(p.id);
  }
  return out;
}

// Start: before photos (≥ minBefore) → operation row with start_time (the timer), task in_progress
router.post('/tasks/:id/start', photosField, wrap(async (req, res) => {
  try {
    const task = await loadTask(req, req.params.id); ensureMine(task, req); await ensureToday(task, req);
    if (['completed', 'skipped'].includes(task.status)) throw conflict('This task is already closed');
    const photos = await getSetting(req.companyId, 'photos');
    const have = (task.photos || []).filter((p) => p.phase === 'before').length + (req.files?.length || 0);
    if (have < photos.minBeforePhotos) throw validationFailed(`At least ${photos.minBeforePhotos} photo(s) before washing`);
    const { lat, lng } = z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }).parse(req.body);
    const result = await db.transaction(async (t) => {
      let opId = task.operation_id; const now = new Date();
      if (!opId) { const [op] = await t.insert(washingOperations).values({ companyId: req.companyId, taskId: task.id, vehicleId: task.vehicle_id, subscriptionId: (await t.query.washingTasks.findFirst({ where: eq(washingTasks.id, task.id) })).subscriptionId, staffId: req.user.id, startTime: now, startLat: lat ?? null, startLng: lng ?? null, status: 'in_progress' }).returning({ id: washingOperations.id }); opId = op.id; }
      const ids = await savePhotos(t, opId, 'before', req.files || [], now);
      await t.update(washingTasks).set({ status: 'in_progress', updatedAt: now }).where(eq(washingTasks.id, task.id));
      await audit(req, { action: 'wash.start', entityType: 'washing_operation', entityId: opId, after: { taskId: task.id, photos: ids.length } }, t);
      return { operationId: opId, photoIds: ids, startTime: task.start_time || now };
    });
    res.status(201).json(result);
  } catch (e) { cleanup(req.files); throw e; }
}));

// Extra photos for an open operation (background retry / more angles). phase = before|after
router.post('/tasks/:id/photos', photosField, wrap(async (req, res) => {
  try {
    const { phase } = z.object({ phase: z.enum(['before', 'after']) }).parse(req.body);
    const task = await loadTask(req, req.params.id); ensureMine(task, req);
    if (!task.operation_id) throw badRequest('Start the wash first');
    if (task.status === 'completed' && phase === 'before') throw conflict('Wash already completed');
    const ids = await db.transaction((t) => savePhotos(t, task.operation_id, phase, req.files || [], new Date()));
    res.status(201).json({ photoIds: ids });
  } catch (e) { cleanup(req.files); throw e; }
}));

// Finish: after photos (≥ minAfter) → end_time, duration, quota consumed, owner SMS (if enabled)
router.post('/tasks/:id/finish', photosField, wrap(async (req, res) => {
  try {
    const task = await loadTask(req, req.params.id); ensureMine(task, req);
    if (task.status === 'completed') throw conflict('Already completed');
    if (!task.operation_id || task.status !== 'in_progress') throw badRequest('Start the wash (before photos) first');
    const photos = await getSetting(req.companyId, 'photos');
    const have = (task.photos || []).filter((p) => p.phase === 'after').length + (req.files?.length || 0);
    if (have < photos.minAfterPhotos) throw validationFailed(`At least ${photos.minAfterPhotos} photo(s) after washing`);
    const { lat, lng, notes } = z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), notes: z.string().max(500).optional() }).parse(req.body);
    const result = await db.transaction(async (t) => {
      const now = new Date();
      const [locked] = await t.select().from(subscriptions).where(eq(subscriptions.id, (await t.query.washingTasks.findFirst({ where: eq(washingTasks.id, task.id) })).subscriptionId)).for('update');
      await savePhotos(t, task.operation_id, 'after', req.files || [], now);
      const consume = locked.washesUsed < locked.washesAllowed;
      if (consume) await t.update(subscriptions).set({ washesUsed: locked.washesUsed + 1, updatedAt: now }).where(eq(subscriptions.id, locked.id));
      await t.update(washingOperations).set({ endTime: now, endLat: lat ?? null, endLng: lng ?? null, notes: notes || null, status: 'completed', quotaConsumed: consume, updatedAt: now }).where(eq(washingOperations.id, task.operation_id));
      await t.update(washingTasks).set({ status: 'completed', outcome: 'washed', updatedAt: now }).where(eq(washingTasks.id, task.id));
      await audit(req, { action: 'wash.complete', entityType: 'washing_operation', entityId: task.operation_id, after: { taskId: task.id, durationMin: Math.round((now - new Date(task.start_time)) / 60000), washesUsed: locked.washesUsed + (consume ? 1 : 0) } }, t);
      return { endTime: now, durationMin: Math.round((now - new Date(task.start_time)) / 60000), washesUsed: locked.washesUsed + (consume ? 1 : 0), washesAllowed: locked.washesAllowed };
    });
    const notif = await getSetting(req.companyId, 'notifications');
    if (notif.smsOnWashCompleted) {
      const [own] = rows(await db.execute(sql`SELECT o.id, o.name, o.mobile FROM owners o JOIN vehicles v ON v.owner_id = o.id WHERE v.id = ${task.vehicle_id}`));
      if (own?.mobile) sendSms(req.companyId, { to: own.mobile, ownerId: own.id, templateKey: 'wash_completed', vars: { OwnerName: own.name, VehicleNumber: task.plate_number, RemainingWashes: result.washesAllowed - result.washesUsed } }).catch(() => {});
    }
    res.json(result);
  } catch (e) { cleanup(req.files); throw e; }
}));

// Could not wash: outcome from settings (+ optional photo + note). Consumes quota only if the outcome says so.
router.post('/tasks/:id/outcome', photosField, wrap(async (req, res) => {
  try {
    const { outcome, note } = z.object({ outcome: z.string().min(1).max(30), note: z.string().max(500).optional() }).parse(req.body);
    const task = await loadTask(req, req.params.id); ensureMine(task, req); await ensureToday(task, req);
    if (task.status === 'completed') throw conflict('Already completed');
    const outcomes = await getSetting(req.companyId, 'outcomes');
    const def = outcomes.find((o) => o.key === outcome);
    if (!def) throw validationFailed('Unknown outcome');
    if (def.requiresPhoto && !(req.files?.length) && !(task.photos || []).length) throw validationFailed('A photo is required for this outcome');
    await db.transaction(async (t) => {
      const now = new Date();
      const full = await t.query.washingTasks.findFirst({ where: eq(washingTasks.id, task.id) });
      let opId = task.operation_id;
      if (!opId) { const [op] = await t.insert(washingOperations).values({ companyId: req.companyId, taskId: task.id, vehicleId: task.vehicle_id, subscriptionId: full.subscriptionId, staffId: req.user.id, startTime: now, endTime: now, status: 'flagged', issueReported: true, issueDescription: `${def.labelEn}${note ? ` – ${note}` : ''}` }).returning({ id: washingOperations.id }); opId = op.id; }
      else await t.update(washingOperations).set({ endTime: now, status: 'flagged', issueReported: true, issueDescription: `${def.labelEn}${note ? ` – ${note}` : ''}`, updatedAt: now }).where(eq(washingOperations.id, opId));
      await savePhotos(t, opId, 'before', req.files || [], now);
      if (def.consumesQuota) { const [locked] = await t.select().from(subscriptions).where(eq(subscriptions.id, full.subscriptionId)).for('update'); if (locked.washesUsed < locked.washesAllowed) { await t.update(subscriptions).set({ washesUsed: locked.washesUsed + 1, updatedAt: now }).where(eq(subscriptions.id, locked.id)); await t.update(washingOperations).set({ quotaConsumed: true }).where(eq(washingOperations.id, opId)); } }
      await t.update(washingTasks).set({ status: 'skipped', outcome, outcomeNote: note || null, updatedAt: now }).where(eq(washingTasks.id, task.id));
      if (outcome === 'postponed') { // same washer gets the car tomorrow (unless a task already exists)
        const tmr = addDays(await bizToday(req.companyId), 1);
        const dup = await t.query.washingTasks.findFirst({ where: and(eq(washingTasks.vehicleId, task.vehicle_id), eq(washingTasks.scheduledDate, tmr), sql`${washingTasks.status} <> 'cancelled'`) });
        if (!dup) { const taskCode = await nextCode(req.companyId, 'task', 'TSK', t); await t.insert(washingTasks).values({ companyId: req.companyId, taskCode, compoundId: full.compoundId, vehicleId: full.vehicleId, subscriptionId: full.subscriptionId, scheduledDate: tmr, assignedTo: req.user.id, isPublished: false, status: 'assigned', assignedBy: 'admin', createdBy: req.user.id }); }
      }
      await audit(req, { action: 'wash.outcome', entityType: 'washing_task', entityId: task.id, after: { outcome, note, consumesQuota: def.consumesQuota } }, t);
      const notif = await getSetting(req.companyId, 'notifications');
      if (notif.notifyAdminOnIssue) await notifyAdmins(req.companyId, { type: 'wash.outcome', title: `${task.plate_number} · ${task.unit_number}: ${def.labelEn}`, body: `${req.user.name} – ${task.compound_name}${note ? ` – ${note}` : ''}`, entityType: 'washing_task', entityId: task.id }, t);
    });
    res.json({ ok: true });
  } catch (e) { cleanup(req.files); throw e; }
}));

router.get('/photos/:photoId', wrap(async (req, res) => {
  const [p] = rows(await db.execute(sql`SELECT p.file_path, p.mime_type FROM wash_photos p JOIN washing_operations o ON o.id = p.operation_id WHERE p.id = ${req.params.photoId} AND o.company_id = ${req.companyId}`));
  if (!p) throw notFound('Photo');
  await sendStored(res, p.file_path, p.mime_type);
}));

export default router;
