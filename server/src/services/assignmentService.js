/**
 * Daily distribution engine.
 *  eligible(compound, date)  → vehicles whose paid subscription covers `date`, allows that weekday, has quota left,
 *                              has not hit its weekly frequency, and has no task on that date.
 *  available(compound, date) → active staff assigned to the compound, working that weekday, not on leave.
 *  distribute()              → even split (fewest tasks first), preferring the staff member who washed the vehicle last.
 * Re-runs are idempotent: existing tasks are kept, only unassigned vehicles get new tasks; tasks of absent staff are moved.
 */
import { and, eq, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getSetting } from './settingsService.js';
import { nextCode, today, addDays, businessToday } from '../lib/util.js';
import { systemAudit } from '../lib/audit.js';
import { notifyAdmins } from './notificationService.js';

const { washingTasks, compounds, users, staffCompounds, staffLeaves, assignmentRuns } = schema;
const rows = (r) => r.rows || r;
const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay();

export async function eligibleVehicles(companyId, compoundId, date) {
  const dow = weekday(date);
  // Week window for frequency check: Saturday-based week (regional), compute start of week
  const wkStart = addDays(date, -((dow + 1) % 7));
  return rows(await db.execute(sql`
    SELECT v.id AS vehicle_id, v.plate_number, s.id AS subscription_id, s.washes_allowed, s.washes_used, s.frequency_per_week,
      (SELECT t.assigned_to FROM washing_tasks t JOIN washing_operations o ON o.task_id = t.id
         WHERE t.vehicle_id = v.id AND o.status IN ('completed','approved') ORDER BY t.scheduled_date DESC LIMIT 1) AS last_staff_id,
      (SELECT count(*) FROM washing_tasks t WHERE t.vehicle_id = v.id AND t.scheduled_date BETWEEN ${wkStart} AND ${date} AND t.status <> 'cancelled')::int AS tasks_this_week
    FROM vehicles v
    JOIN subscription_vehicles sv ON sv.vehicle_id = v.id
    JOIN subscriptions s ON s.id = sv.subscription_id
    WHERE v.company_id = ${companyId} AND v.compound_id = ${compoundId} AND v.status = 'active'
      AND s.payment_status = 'paid' AND s.status IN ('active','expiring_soon')
      AND s.start_date <= ${date} AND s.end_date >= ${date}
      AND s.allowed_days @> ${JSON.stringify([dow])}::jsonb
      AND s.washes_used < s.washes_allowed
      AND NOT EXISTS (SELECT 1 FROM washing_tasks t WHERE t.vehicle_id = v.id AND t.scheduled_date = ${date} AND t.status <> 'cancelled')
    ORDER BY v.plate_number`)).filter((r) => r.tasks_this_week < r.frequency_per_week);
}

export async function availableStaff(companyId, compoundId, date) {
  const dow = weekday(date);
  // Staff scheduled in this compound on that weekday, not on leave; load = tasks that day IN THIS COMPOUND, capacity = schedule cell
  return rows(await db.execute(sql`
    SELECT u.id, u.name, u.employee_code, ss.capacity AS daily_capacity,
      (SELECT count(*) FROM washing_tasks t WHERE t.assigned_to = u.id AND t.scheduled_date = ${date} AND t.compound_id = ${compoundId} AND t.status <> 'cancelled')::int AS load,
      (SELECT count(*) FROM washing_tasks t WHERE t.assigned_to = u.id AND t.scheduled_date = ${date} AND t.status <> 'cancelled')::int AS total_load
    FROM users u JOIN staff_schedule ss ON ss.user_id = u.id AND ss.dow = ${dow} AND ss.compound_id = ${compoundId}
    WHERE u.company_id = ${companyId} AND u.user_type = 'staff' AND u.is_active = true
      AND NOT EXISTS (SELECT 1 FROM staff_leaves l WHERE l.user_id = u.id AND ${date} BETWEEN l.start_date AND l.end_date)
    ORDER BY u.name`));
}

async function createTask(t, companyId, compoundId, v, date, staffId, assignedBy, createdBy) {
  const taskCode = await nextCode(companyId, 'task', 'TSK', t);
  const [row] = await t.insert(washingTasks).values({ companyId, taskCode, compoundId, vehicleId: v.vehicle_id, subscriptionId: v.subscription_id, scheduledDate: date, assignedTo: staffId, isPublished: !staffId, status: 'assigned', assignedBy, createdBy }).returning();
  return row;
}

/**
 * Distribute a set of compounds for one date in ONE pass, so a worker who belongs to several compounds is loaded fairly
 * across all of them (global least-loaded first), preferring the vehicle's last washer when loads tie.
 */
export async function distributeCompounds(companyId, compoundIds, date, { trigger = 'manual', createdBy = null } = {}) {
  const cfg = await getSetting(companyId, 'assignment');
  const perCompound = {};
  const queue = [];
  const staffByCompound = {};
  const load = {}; const capOf = {}; const names = {}; // keyed by `${staffId}|${compoundId}` – a washer has his own capacity in each compound
  const K = (sid, cid) => `${sid}|${cid}`;
  for (const compoundId of compoundIds) {
    const vehicles = await eligibleVehicles(companyId, compoundId, date);
    const staff = await availableStaff(companyId, compoundId, date);
    staffByCompound[compoundId] = staff;
    staff.forEach((s) => { load[K(s.id, compoundId)] = s.load; capOf[K(s.id, compoundId)] = Math.min(s.daily_capacity || cfg.defaultCapacity || Infinity, cfg.maxPerStaffPerDay || Infinity); names[s.id] = s.name; });
    perCompound[compoundId] = { date, compoundId, eligible: vehicles.length, staff: staff.length, assigned: 0, pooled: 0, perStaff: {}, capacity: staff.reduce((a, s) => a + (s.daily_capacity || 0), 0) };
    vehicles.forEach((v) => queue.push({ compoundId, v }));
  }
  if (!queue.length) return Object.values(perCompound);
  const byC = compoundIds.map((c) => queue.filter((q) => q.compoundId === c)); const ordered = []; let i = 0;
  while (ordered.length < queue.length) { const list = byC[i % byC.length]; if (list.length) ordered.push(list.shift()); i++; }
  const ratio = (k) => load[k] / (capOf[k] === Infinity ? 1e6 : capOf[k]);
  // 1) Greedy: least utilised candidate in that compound (load ÷ capacity), last washer wins ties
  const plan = [];
  for (const { compoundId, v } of ordered) {
    const candidates = staffByCompound[compoundId].filter((s) => load[K(s.id, compoundId)] < capOf[K(s.id, compoundId)]);
    let pick = null;
    if (candidates.length) {
      const minR = Math.min(...candidates.map((s) => ratio(K(s.id, compoundId))));
      const atMin = candidates.filter((s) => Math.abs(ratio(K(s.id, compoundId)) - minR) < 1e-9);
      pick = (cfg.preferLastWasher && atMin.find((s) => s.id === v.last_staff_id)) || atMin[0];
    }
    if (pick) load[K(pick.id, compoundId)]++;
    plan.push({ compoundId, v, staffId: pick?.id || null });
  }
  // 2) Local rebalance inside each compound: move a task when it lowers the pair's worst utilisation
  for (let guard = 0; guard < 500; guard++) {
    let moved = false;
    for (const compoundId of compoundIds) {
      const team = staffByCompound[compoundId];
      for (const heavy of team) for (const light of team) {
        const kh = K(heavy.id, compoundId), kl = K(light.id, compoundId);
        if (heavy.id === light.id || load[kl] >= capOf[kl]) continue;
        if (!(Math.max((load[kh] - 1) / capOf[kh], (load[kl] + 1) / capOf[kl]) < Math.max(ratio(kh), ratio(kl)) - 1e-9)) continue;
        const task = plan.find((p) => p.compoundId === compoundId && p.staffId === heavy.id && p.v.last_staff_id !== heavy.id) || plan.find((p) => p.compoundId === compoundId && p.staffId === heavy.id);
        if (!task) continue;
        task.staffId = light.id; load[kh]--; load[kl]++; moved = true;
      }
    }
    if (!moved) break;
  }
  await db.transaction(async (t) => {
    for (const { compoundId, v, staffId } of plan) {
      await createTask(t, companyId, compoundId, v, date, staffId, 'auto', createdBy);
      const sum = perCompound[compoundId];
      if (staffId) { sum.assigned++; sum.perStaff[names[staffId]] = (sum.perStaff[names[staffId]] || 0) + 1; } else sum.pooled++;
    }
    for (const sum of Object.values(perCompound)) if (sum.eligible) await t.insert(assignmentRuns).values({ companyId, compoundId: sum.compoundId, forDate: date, trigger, summary: sum, createdBy });
  });
  for (const sum of Object.values(perCompound)) {
    if (sum.pooled && !sum.staff) await notifyAdmins(companyId, { type: 'assignment.no_staff', title: `No staff available for ${date}`, body: `${sum.pooled} vehicle(s) waiting in the pool`, entityType: 'compound', entityId: sum.compoundId });
    else if (sum.pooled) await notifyAdmins(companyId, { type: 'assignment.over_capacity', title: `Capacity exceeded for ${date}`, body: `${sum.pooled} vehicle(s) could not be assigned – all staff at capacity`, entityType: 'compound', entityId: sum.compoundId });
  }
  return Object.values(perCompound);
}

export async function distributeCompound(companyId, compoundId, date, opts = {}) { return (await distributeCompounds(companyId, [compoundId], date, opts))[0]; }

/** Distribute every active compound of a company for a date (used by the nightly job and the admin button). */
export async function distributeAll(companyId, date, opts = {}) {
  const cps = await db.select({ id: compounds.id, name: compounds.name }).from(compounds).where(and(eq(compounds.companyId, companyId), eq(compounds.status, 'active')));
  const results = await distributeCompounds(companyId, cps.map((c) => c.id), date, opts);
  const named = results.map((r) => ({ compound: cps.find((c) => c.id === r.compoundId)?.name, ...r }));
  const total = named.reduce((a, r) => a + r.assigned + r.pooled, 0);
  if (total) await systemAudit(companyId, { action: 'assignment.run', entityType: 'washing_task', after: { date, results: named } });
  return named;
}

/** Staff is absent on `date` (emergency leave): move their not-started tasks to available colleagues (or the pool). */
export async function reassignAbsent(companyId, userId, date, { createdBy = null, reason = 'absent' } = {}) {
  const tasks = rows(await db.execute(sql`SELECT t.id, t.compound_id, t.vehicle_id FROM washing_tasks t WHERE t.company_id = ${companyId} AND t.assigned_to = ${userId} AND t.scheduled_date = ${date} AND t.status IN ('assigned','accepted')`));
  const moved = {}; let pooled = 0;
  const byCompound = tasks.reduce((m, t) => { (m[t.compound_id] ||= []).push(t); return m; }, {});
  for (const [compoundId, list] of Object.entries(byCompound)) {
    const staff = (await availableStaff(companyId, compoundId, date)).filter((s) => s.id !== userId);
    const load = Object.fromEntries(staff.map((s) => [s.id, s.load]));
    for (const task of list) {
      let pick = null;
      const cfgA = await getSetting(companyId, 'assignment'); const capA = (s) => Math.min(s.daily_capacity || cfgA.defaultCapacity || Infinity, cfgA.maxPerStaffPerDay || Infinity);
      const open = staff.filter((s) => load[s.id] < capA(s));
      if (open.length) { const min = Math.min(...open.map((s) => load[s.id] / (capA(s) === Infinity ? 1e6 : capA(s)))); pick = open.find((s) => Math.abs(load[s.id] / (capA(s) === Infinity ? 1e6 : capA(s)) - min) < 1e-9); }
      await db.update(washingTasks).set({ assignedTo: pick?.id || null, isPublished: !pick, assignedBy: 'absence', updatedAt: new Date() }).where(eq(washingTasks.id, task.id));
      if (pick) { load[pick.id]++; moved[pick.name] = (moved[pick.name] || 0) + 1; } else pooled++;
    }
  }
  if (tasks.length) {
    await db.insert(assignmentRuns).values({ companyId, compoundId: null, forDate: date, trigger: 'absence', summary: { userId, reason, moved, pooled, total: tasks.length }, createdBy });
    await systemAudit(companyId, { action: 'assignment.reassign_absent', entityType: 'user', entityId: userId, after: { date, moved, pooled } });
  }
  return { total: tasks.length, moved, pooled };
}

/** Nightly: for each company, if the configured hour matches, distribute tomorrow. Called hourly by the scheduler. */
export async function runScheduledAssignment(nowHour) {
  const cos = await db.select({ id: schema.companies.id }).from(schema.companies);
  for (const { id } of cos) {
    const cfg = await getSetting(id, 'assignment');
    if (!cfg.enabled || Number(cfg.assignHour) !== nowHour) continue;
    const tomorrow = addDays(businessToday((await getSetting(id, 'general')).dayStartHour), 1);
    const already = await db.query.assignmentRuns.findFirst({ where: and(eq(assignmentRuns.companyId, id), eq(assignmentRuns.forDate, tomorrow), eq(assignmentRuns.trigger, 'scheduled')) });
    if (already) continue;
    await distributeAll(id, tomorrow, { trigger: 'scheduled' }).catch((e) => console.error('scheduled assignment failed', e));
  }
}
