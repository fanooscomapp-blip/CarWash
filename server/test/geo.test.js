import assert from 'node:assert/strict';
import { clusterWithSizes, routeOrder, spread, distanceM } from '../src/lib/geo.js';
const step = (m) => console.log('✓', m);
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const j = async (m, p, b, t) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(x)}`); return x; };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// 1) pure algorithm: three obvious blobs → three tight clusters
const blob = (lat, lng, n) => Array.from({ length: n }, (_, i) => ({ lat: lat + (i % 4) * 0.0003, lng: lng + Math.floor(i / 4) * 0.0003, tag: `${lat}` }));
const pts = [...blob(30.0, 31.0, 12), ...blob(30.02, 31.0, 12), ...blob(30.0, 31.03, 12)];
const cl = clusterWithSizes(pts, [12, 12, 12]);
assert.deepEqual(cl.map((c) => c.length), [12, 12, 12]); assert.ok(cl.every((c) => new Set(c.map((p) => p.tag)).size === 1)); step(`k-means: 3 blobs → 3 pure clusters, spread ${cl.map(spread).join('/')} m`);
const cl2 = clusterWithSizes(pts, [20, 16]); assert.deepEqual(cl2.map((c) => c.length), [20, 16]); step('capacity-aware sizes respected (20/16)');
const r = routeOrder(pts.slice(0, 12)); let total = 0; for (let i = 1; i < r.length; i++) total += distanceM(r[i - 1], r[i]); assert.ok(total < 12 * 60); step(`route order: 12 cars in ${Math.round(total)} m of walking`);

// 2) engine: distribute tomorrow with clustering on vs off and compare the per-washer spread
const admin = (await j('POST', '/auth/login', { email: 'admin@carwash.local', password: 'Admin@12345' })).token;
const me = await j('GET', '/admin/staff/board', null, admin); const tmr = addDays(me.today, 1);
const run = async (cluster) => {
  await j('PUT', '/admin/settings/assignment', { enabled: true, assignHour: 20, preferLastWasher: true, maxPerStaffPerDay: 0, defaultCapacity: 32, publishUnassignedToPool: true, clusterByLocation: cluster }, admin);
  const b0 = await j('GET', `/admin/staff/board?date=${tmr}`, null, admin); for (const t of b0.tasks) await j('POST', `/admin/staff/board/tasks/${t.id}/cancel`, { reason: 'test' }, admin);
  const res = await j('POST', '/admin/staff/board/distribute', { date: tmr }, admin);
  const b = await j('GET', `/admin/staff/board?date=${tmr}`, null, admin);
  const byStaff = {}; b.tasks.filter((t) => t.status !== 'cancelled' && t.assigned_to && t.gps_lat).forEach((t) => (byStaff[t.assigned_to] ||= []).push({ lat: +t.gps_lat, lng: +t.gps_lng }));
  const spreads = Object.values(byStaff).map(spread); return { res, avg: Math.round(spreads.reduce((a, b) => a + b, 0) / Math.max(1, spreads.length)), counts: Object.values(byStaff).map((v) => v.length) };
};
const off = await run(false); const on = await run(true);
step(`spread per washer: clustering OFF ${off.avg} m (${off.counts}) · ON ${on.avg} m (${on.counts})`);
assert.ok(on.avg <= off.avg, 'clustering should not make routes longer');
assert.ok(on.res.some((r) => r.clusters?.length), 'run summary carries cluster info'); step(`summary: ${JSON.stringify(on.res.find((r) => r.clusters)?.clusters)}`);

// 3) synthetic compound: 30 cars in 3 blobs, 3 washers → with clustering each washer should stay inside one blob
const stamp = String(Date.now()).slice(-5);
const cp = await j('POST', '/admin/compounds', { name: `Geo ${stamp}`, code: `GEO${stamp}`, status: 'active' }, admin);
const plan = await j('POST', '/admin/plans', { name: `Daily ${stamp}`, scope: 'per_vehicle', planType: 'monthly', maxWashes: 30, allowedDays: [0, 1, 2, 3, 4, 5, 6], maxFrequencyPerWeek: 7, price: 500 }, admin);
const blobs = [[30.1, 31.1], [30.13, 31.1], [30.1, 31.14]];
for (let i = 0; i < 30; i++) {
  const [blat, blng] = blobs[i % 3];
  const reg = await j('POST', '/admin/registration', { compoundId: cp.id, owner: { mobile: `0122${stamp}${String(i).padStart(2, '0')}`.slice(0, 11), name: `Geo Owner ${i}` }, vehicles: [{ plateNumber: `GEO ${stamp}${i}`, unitNumber: `G-${i}`, vehicleType: 'sedan', color: 'white', gpsLat: blat + (i % 5) * 0.0004, gpsLng: blng + Math.floor(i / 15) * 0.0004 }] }, admin);
  await j('POST', '/admin/subscriptions', { unitId: reg.vehicles[0].unitId, compoundId: cp.id, vehicleIds: [reg.vehicles[0].id], planId: plan.id, paymentStatus: 'paid', paymentMethod: 'cash', discount: 0 }, admin);
}
const staffIds = [];
for (let k = 0; k < 3; k++) staffIds.push((await j('POST', '/admin/staff', { name: `Geo Washer ${k}`, employeeCode: `GEO-${stamp}-${k}`, pin: '1111', schedule: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, compoundId: cp.id, capacity: 12 })) }, admin)).id);
const runGeo = async (cluster) => {
  await j('PUT', '/admin/settings/assignment', { enabled: true, assignHour: 20, preferLastWasher: true, maxPerStaffPerDay: 0, defaultCapacity: 32, publishUnassignedToPool: true, clusterByLocation: cluster }, admin);
  const b0 = await j('GET', `/admin/staff/board?date=${tmr}&compoundId=${cp.id}`, null, admin); for (const t of b0.tasks) await j('POST', `/admin/staff/board/tasks/${t.id}/cancel`, { reason: 'test' }, admin);
  await j('POST', '/admin/staff/board/distribute', { date: tmr, compoundId: cp.id }, admin);
  const b = await j('GET', `/admin/staff/board?date=${tmr}&compoundId=${cp.id}`, null, admin);
  const byStaff = {}; b.tasks.filter((t) => t.status !== 'cancelled' && t.assigned_to).forEach((t) => (byStaff[t.assigned_to] ||= []).push({ lat: +t.gps_lat, lng: +t.gps_lng }));
  return { counts: Object.values(byStaff).map((v) => v.length), spreads: Object.values(byStaff).map(spread) };
};
const g0 = await runGeo(false), g1 = await runGeo(true);
step(`synthetic 30 cars / 3 washers → OFF counts ${g0.counts} spread ${g0.spreads} m · ON counts ${g1.counts} spread ${g1.spreads} m`);
assert.deepEqual([...g1.counts].sort(), [10, 10, 10]); assert.ok(Math.max(...g1.spreads) < 150, 'each washer should stay inside one blob'); assert.ok(Math.max(...g0.spreads) > 1000, 'without clustering cars are mixed');
step('clustering keeps every washer inside one area while loads stay even');
console.log('\nALL GEO TESTS PASSED');
