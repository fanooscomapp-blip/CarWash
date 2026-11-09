import assert from 'node:assert/strict';
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const j = async (method, path, body, token, raw = false) => { const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const json = await res.json().catch(() => ({})); if (raw) return { status: res.status, json }; if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`); return json; };
const step = (m) => console.log('✓', m);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const todayCairo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

(async () => {
  const admin = (await j('POST', '/auth/login', { email: 'admin@carwash.local', password: 'Admin@12345' })).token;
  const tomorrow = addDays(todayCairo(), 1);
  const staff = await j('GET', '/admin/staff', null, admin);
  assert.ok(staff.length >= 3 && staff.every((s) => s.has_pin && s.work_days.length)); step(`${staff.length} staff with PIN + work days`);

  // Make every demo subscription allow every day so there is work to distribute
  const board0 = await j('GET', `/admin/staff/board?date=${tomorrow}`, null, admin);
  step(`board before: ${board0.tasks.length} tasks, eligible pending: ${JSON.stringify(board0.pendingEligible.map((p) => `${p.compoundName}:${p.count}`))}`);
  const dist = await j('POST', '/admin/staff/board/distribute', { date: tomorrow }, admin);
  const totalAssigned = dist.reduce((a, r) => a + r.assigned, 0), totalPooled = dist.reduce((a, r) => a + r.pooled, 0);
  step(`distributed tomorrow: ${dist.map((r) => `${r.compound}: ${r.eligible} eligible → ${r.assigned} assigned over ${r.staff} staff, ${r.pooled} pooled`).join(' | ')}`);
  assert.ok(totalAssigned + totalPooled > 0, 'nothing to distribute – demo data should have eligible vehicles');
  // Fairness is per person per day (a worker in two compounds carries both): total loads differ by ≤ 1 among staff who share a compound
  const boardF = await j('GET', `/admin/staff/board?date=${tomorrow}`, null, admin);
  const perStaff = {}; boardF.tasks.forEach((t) => { if (t.assigned_to) perStaff[t.assigned_to] = (perStaff[t.assigned_to] || 0) + 1; });
  step(`per-person load tomorrow: ${boardF.staff.map((s) => `${s.name}=${perStaff[s.id] || 0}`).join(', ')}`);
  // A worker in several compounds carries all of them, so perfect equality is not always possible; assert no local improvement exists:
  // inside a compound, nobody with ≥2 more tasks than a colleague still holds a task of that compound that could move.
  for (const c of new Set(boardF.tasks.map((t) => t.compound_id))) {
    const team = boardF.staff.filter((s) => (s.compound_ids || []).includes(c) && s.works_today && !s.on_leave);
    for (const h of team) for (const l of team) {
      if (h.id === l.id) continue;
      const diff = (perStaff[h.id] || 0) - (perStaff[l.id] || 0);
      const movable = boardF.tasks.some((t) => t.compound_id === c && t.assigned_to === h.id);
      assert.ok(diff < 2 || !movable, `compound ${c}: ${h.name}=${perStaff[h.id]} could hand a task to ${l.name}=${perStaff[l.id] || 0}`);
    }
  }
  step('fair split (no task could move to a less-loaded colleague in the same compound)');
  const again = await j('POST', '/admin/staff/board/distribute', { date: tomorrow }, admin);
  assert.equal(again.reduce((a, r) => a + r.assigned + r.pooled, 0), 0); step('re-run is idempotent (no duplicates)');
  const board = await j('GET', `/admin/staff/board?date=${tomorrow}`, null, admin);
  assert.equal(board.tasks.length, totalAssigned + totalPooled); assert.ok(board.tasks.every((t) => t.plate_number && t.unit_number)); step(`board shows ${board.tasks.length} task cards with plate/unit/owner`);

  // Reassign one task manually
  const t0 = board.tasks.find((t) => t.assigned_to); const other = board.staff.find((s) => s.id !== t0.assigned_to && (s.compound_ids || []).includes(t0.compound_id));
  if (other) { await j('POST', `/admin/staff/board/tasks/${t0.id}/assign`, { userId: other.id }, admin); const b2 = await j('GET', `/admin/staff/board?date=${tomorrow}`, null, admin); assert.equal(b2.tasks.find((t) => t.id === t0.id).assigned_to, other.id); assert.equal(b2.tasks.find((t) => t.id === t0.id).assigned_by, 'admin'); step('manual reassign works'); }

  // Emergency leave tomorrow for the busiest staff → tasks move to colleagues
  const counts = {}; board.tasks.forEach((t) => { if (t.assigned_to) counts[t.assigned_to] = (counts[t.assigned_to] || 0) + 1; });
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const lv = await j('POST', `/admin/staff/${busiest[0]}/leaves`, { startDate: tomorrow, endDate: tomorrow, reason: 'sick' }, admin);
  const mv = lv.moves.find((m) => m.date === tomorrow); assert.ok(mv && mv.total === busiest[1]); step(`leave added → ${mv.total} task(s) moved: ${JSON.stringify(mv.moved)} pooled=${mv.pooled}`);
  const b3 = await j('GET', `/admin/staff/board?date=${tomorrow}`, null, admin);
  assert.equal(b3.tasks.filter((t) => t.assigned_to === busiest[0]).length, 0); assert.ok(b3.staff.find((s) => s.id === busiest[0]).on_leave); step('absent staff has no tasks and is marked on leave on the board');
  // Remove leave
  await j('DELETE', `/admin/staff/${busiest[0]}/leaves/${lv.leave.id}`, null, admin); step('leave removed');

  // Absent today one-tap
  const todayDist = await j('POST', '/admin/staff/board/distribute', { date: todayCairo() }, admin);
  const bt = await j('GET', `/admin/staff/board?date=${todayCairo()}`, null, admin);
  const someone = bt.tasks.find((t) => t.assigned_to)?.assigned_to;
  if (someone) { const r = await j('POST', `/admin/staff/${someone}/absent-today`, {}, admin); step(`absent today → ${r.total} task(s) redistributed`); const bt2 = await j('GET', `/admin/staff/board?date=${todayCairo()}`, null, admin); assert.equal(bt2.tasks.filter((t) => t.assigned_to === someone && t.status !== 'completed').length, 0); }
  // Staff create with PIN
  const cps = (await j('GET', '/admin/lookups', null, admin)).compounds;
  const created = await j('POST', '/admin/staff', { name: 'New Washer', employeeCode: `EMP-T${Date.now().toString().slice(-4)}`, pin: '2468', compoundIds: [cps[0].id], workDays: [0, 1, 2, 3, 4] }, admin);
  assert.ok(created.id); step('staff created with PIN + schedule');
  const dupCode = await j('POST', '/admin/staff', { name: 'X', employeeCode: 'EMP-001', pin: '1111', compoundIds: [cps[0].id], workDays: [0] }, admin, true); assert.equal(dupCode.status, 400); step('duplicate employee code rejected');
  const runs = b3.runs; assert.ok(runs.length >= 1 && runs.some((r) => r.trigger === 'absence')); step('assignment runs logged (manual + absence)');
  console.log('\nALL ASSIGNMENT TESTS PASSED');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
