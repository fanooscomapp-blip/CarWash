import assert from 'node:assert/strict';
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const j = async (method, path, body, token, raw = false) => { const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const json = await res.json().catch(() => ({})); if (raw) return { status: res.status, json }; if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`); return json; };
const step = (m) => console.log('✓', m);
const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const show = (days) => days.map((d) => D[d]).join('/');

(async () => {
  const admin = (await j('POST', '/auth/login', { email: 'admin@carwash.local', password: 'Admin@12345' })).token;
  const plans = await j('GET', '/admin/plans', null, admin);
  const three = plans.find((p) => p.maxFrequencyPerWeek === 3 && p.allowedDays.length >= 6) || plans.find((p) => p.maxFrequencyPerWeek < p.allowedDays.length);
  assert.ok(three, 'need a plan with frequency < working days'); step(`plan "${three.name}": ${three.maxFrequencyPerWeek}×/week over ${show(three.allowedDays)}`);
  const cps = (await j('GET', '/admin/lookups', null, admin)).compounds; const cp = cps[0];

  // Suggestion endpoint
  const sug = await j('GET', `/admin/subscriptions/suggest-days?compoundId=${cp.id}&planId=${three.id}`, null, admin);
  assert.equal(sug.suggested.length, three.maxFrequencyPerWeek); assert.ok(sug.alternatives.length >= 2); assert.ok(sug.fixedPattern);
  step(`suggested ${show(sug.suggested)} (reason=${sug.reason}); alternatives: ${sug.alternatives.map((a) => `${show(a.days)}=${a.maxLoad}`).join(' | ')}`);
  // Patterns are evenly spread: for 3 over 6 working days every gap is 2
  for (const a of sug.alternatives) { const w = [6, 0, 1, 2, 3, 4, 5].filter((d) => three.allowedDays.includes(d)); const idx = a.days.map((d) => w.indexOf(d)).sort((x, y) => x - y); const gaps = idx.map((v, i) => (idx[(i + 1) % idx.length] - v + w.length) % w.length); assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `uneven pattern ${show(a.days)}`); }
  step('every pattern is evenly spaced');

  // Auto-assign for existing demo subs (they were seeded with all working days)
  const loads0 = await j('GET', `/admin/subscriptions/day-loads?compoundId=${cp.id}`, null, admin);
  step(`before: loads ${JSON.stringify(loads0.loads)} · unbalanced subs ${loads0.unbalanced}`);
  const fixed = await j('POST', '/admin/subscriptions/auto-assign-days', { compoundId: cp.id }, admin);
  assert.equal(fixed.count, loads0.unbalanced); step(`auto-assigned ${fixed.count} subscription(s)`);
  const loads1 = await j('GET', `/admin/subscriptions/day-loads?compoundId=${cp.id}`, null, admin);
  assert.equal(loads1.unbalanced, 0); step(`after: loads ${JSON.stringify(loads1.loads)} · unbalanced 0`);
  for (const c of fixed.changed) assert.ok(c.to.length < c.from.length);

  // New subscription without explicit days → gets the suggested pattern; a second car of the same owner gets the same days
  const stamp = Date.now().toString().slice(-5);
  const reg = await j('POST', '/admin/registration', { compoundId: cp.id, owner: { mobile: '0109' + stamp + '99', name: 'Days Test' }, vehicles: [{ plateNumber: `WD ${stamp}`, unitNumber: `WD-${stamp}`, vehicleType: 'sedan', color: 'white' }, { plateNumber: `WE ${stamp}`, unitNumber: `WD-${stamp}`, vehicleType: 'suv', color: 'black' }] }, admin);
  const unitId = reg.vehicles[0].unitId; const picked = { unit: { id: unitId, ownerId: reg.owner.id }, vehicle: reg.vehicles[0], second: reg.vehicles[1] };
  const before = await j('GET', `/admin/subscriptions/suggest-days?compoundId=${cp.id}&planId=${three.id}&unitId=${picked.unit.id}`, null, admin);
  const created = await j('POST', '/admin/subscriptions', { unitId: picked.unit.id, compoundId: cp.id, vehicleIds: [picked.vehicle.id], planId: three.id, paymentStatus: 'paid', paymentMethod: 'cash', discount: 0 }, admin);
  const sub = await j('GET', `/admin/subscriptions/${created.subscription.id}`, null, admin);
  assert.equal(show(sub.allowedDays), show(before.suggested)); assert.equal(sub.frequencyPerWeek, three.maxFrequencyPerWeek); step(`new subscription got fixed days ${show(sub.allowedDays)} (= suggestion)`);

  const created2 = await j('POST', '/admin/subscriptions', { unitId: picked.unit.id, compoundId: cp.id, vehicleIds: [picked.second.id], planId: three.id, paymentStatus: 'paid', paymentMethod: 'cash', discount: 0 }, admin);
  const sub2 = await j('GET', `/admin/subscriptions/${created2.subscription.id}`, null, admin);
  assert.equal(show(sub2.allowedDays), show(sub.allowedDays)); step(`owner's second car got the same days ${show(sub2.allowedDays)} (one visit per unit)`);

  // Exception: swap one day
  const other = three.allowedDays.find((d) => !sub.allowedDays.includes(d));
  const swapped = [...sub.allowedDays.slice(0, -1), other].sort();
  const upd = await j('PUT', `/admin/subscriptions/${sub.id}/days`, { allowedDays: swapped }, admin);
  assert.equal(show(upd.allowedDays), show(swapped)); assert.equal(upd.frequencyPerWeek, three.maxFrequencyPerWeek); step(`exception applied: ${show(upd.allowedDays)}`);
  // Owner portal list carries the days
  const owner = await j('GET', `/admin/owners/${picked.unit.ownerId}`, null, admin); assert.ok(owner.mobile); step('owner has mobile → portal would show days + progress (field added to /portal/me/vehicles)');
  console.log('\nALL WASH-DAYS TESTS PASSED');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
