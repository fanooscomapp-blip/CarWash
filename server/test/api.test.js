// End-to-end API test: run `npm run test` with the server running on :4000.
import assert from 'node:assert/strict';
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let token;
const api = async (method, path, body, raw = false) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (raw) return { status: res.status, json };
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const step = (name) => console.log('✓', name);

(async () => {
  // Auth
  const bad = await api('POST', '/auth/login', { email: 'admin@carwash.local', password: 'wrong' }, true);
  assert.equal(bad.status, 401); step('rejects wrong password');
  const login = await api('POST', '/auth/login', { email: 'admin@carwash.local', password: 'Admin@12345' });
  token = login.token; assert.ok(login.user.permissions.includes('*')); step('admin login');

  const dash = await api('GET', '/admin/dashboard');
  assert.ok(dash.kpis.compounds >= 3); step(`dashboard KPIs (compounds=${dash.kpis.compounds}, active=${dash.kpis.active_subscriptions}, expiring=${dash.kpis.expiring_subscriptions}, expired=${dash.kpis.expired_subscriptions}, pending=${dash.kpis.pending_payments})`);

  // Scenario 1 – compound → unit+owner → vehicle → subscription
  const stamp = Date.now().toString().slice(-5);
  const compound = await api('POST', '/admin/compounds', { name: `Test Compound ${stamp}`, code: `TC${stamp}`, unitsCount: 10, contactPerson: 'QA', contactMobile: '+201000000000' });
  step('create compound');
  const dup = await api('POST', '/admin/compounds', { name: 'Dup', code: `TC${stamp}` }, true);
  assert.equal(dup.status, 409); step('duplicate compound code rejected');
  const unit = await api('POST', '/admin/units', { compoundId: compound.id, unitNumber: 'Z-1', owner: { name: 'QA Owner', mobile: `+2012${stamp}000` } });
  step('create unit with inline owner');
  const vehicle = await api('POST', '/admin/vehicles', { unitId: unit.id, plateNumber: `QA ${stamp}`, brand: 'Toyota', model: 'Corolla', color: 'White', vehicleType: 'sedan' });
  assert.match(vehicle.vehicleCode, /^VH-\d{6}$/); step(`create vehicle ${vehicle.vehicleCode}`);
  const vehicle2 = await api('POST', '/admin/vehicles', { unitId: unit.id, plateNumber: `QB ${stamp}`, brand: 'Kia', model: 'Sportage', vehicleType: 'suv' });
  step('second vehicle under same unit');

  const plans = await api('GET', '/admin/plans?active=true');
  const monthly = plans.find((p) => p.planType === 'monthly' && p.scope === 'per_vehicle');
  const quote = await api('GET', `/admin/plans/${monthly.id}/quote?compoundId=${compound.id}&vehicleType=suv`);
  assert.equal(quote.price, 520); step('vehicle-type price override resolves (suv → 520)');

  const pending = await api('POST', '/admin/subscriptions', { unitId: unit.id, vehicleIds: [vehicle.id], planId: monthly.id, paymentStatus: 'pending', discount: 50 });
  assert.equal(pending.subscription.status, 'pending_payment'); assert.equal(Number(pending.subscription.finalAmount), 400); step('subscription created pending payment (450-50=400)');
  const overlap = await api('POST', '/admin/subscriptions', { unitId: unit.id, vehicleIds: [vehicle.id], planId: monthly.id, paymentStatus: 'paid' }, true);
  assert.equal(overlap.status, 409); step('overlapping subscription for same vehicle blocked');
  const otherCompound = (await api('GET', '/admin/compounds')).data.find((c) => c.id !== compound.id);
  const foreignVehicle = (await api('GET', `/admin/vehicles?pageSize=1&compoundId=${otherCompound.id}`)).data[0];
  const wrongUnit = await api('POST', '/admin/subscriptions', { unitId: unit.id, vehicleIds: [foreignVehicle.id], planId: monthly.id }, true);
  assert.equal(wrongUnit.status, 422); step('vehicle from another unit rejected');

  // Plan restricted to another compound → hidden for this compound and refused on create
  const scoped = await api('POST', '/admin/plans', { name: `Scoped ${stamp}`, planType: 'monthly', price: 500, allowedDays: [0, 1, 2, 3, 4, 6], maxFrequencyPerWeek: 3, maxWashes: 12, scope: 'per_vehicle', compoundIds: [otherCompound.id] });
  assert.deepEqual(scoped.compoundIds, [otherCompound.id]);
  const visible = await api('GET', `/admin/plans?compoundId=${compound.id}`); assert.ok(!visible.some((p) => p.id === scoped.id));
  const visibleOther = await api('GET', `/admin/plans?compoundId=${otherCompound.id}`); assert.ok(visibleOther.some((p) => p.id === scoped.id));
  const scopedSub = await api('POST', '/admin/subscriptions', { unitId: unit.id, vehicleIds: [vehicle.id], planId: scoped.id, startDate: '2031-01-01' }, true);
  assert.equal(scopedSub.status, 422); step('plan scoped to specific compounds: hidden elsewhere and refused on create');
  await api('DELETE', `/admin/plans/${scoped.id}`);
  // Payment totals follow the compound filter
  const payAll = await api('GET', '/admin/payments'); const payOne = await api('GET', `/admin/payments?compoundId=${otherCompound.id}`);
  assert.ok(Number(payOne.totals.approved) <= Number(payAll.totals.approved)); assert.ok(payOne.totals.pending_count <= payAll.totals.pending_count); step('payment KPI cards follow the compound filter');

  const approved = await api('POST', `/admin/payments/${pending.payment.id}/approve`, {});
  assert.equal(approved.subscriptionStatus, 'active'); step('payment approval activates subscription');
  const twice = await api('POST', `/admin/payments/${pending.payment.id}/approve`, {}, true);
  assert.equal(twice.status, 409); step('double approval blocked');

  // Multi-vehicle plan
  const family = plans.find((p) => p.scope === 'multi_vehicle');
  const perVehicleTwo = await api('POST', '/admin/subscriptions', { unitId: unit.id, vehicleIds: [vehicle2.id, vehicle.id], planId: monthly.id, paymentStatus: 'paid' }, true);
  assert.equal(perVehicleTwo.status, 422); step('per-vehicle plan refuses two vehicles');
  const fam = await api('POST', '/admin/subscriptions', { unitId: unit.id, vehicleIds: [vehicle2.id], planId: family.id, paymentStatus: 'paid', paymentMethod: 'cash' });
  assert.equal(fam.subscription.status, 'active'); step('family plan subscription active immediately with cash');

  // Renewal
  const renewal = await api('POST', `/admin/subscriptions/${pending.subscription.id}/renew`, { planId: monthly.id, paymentStatus: 'paid', discount: 0 });
  assert.equal(renewal.renewal.status, 'completed'); assert.equal(renewal.subscription.renewedFromId, pending.subscription.id); step(`renewal created ${renewal.renewal.renewalCode}, starts ${renewal.subscription.startDate}`);
  const renewAgain = await api('POST', `/admin/subscriptions/${pending.subscription.id}/renew`, { paymentStatus: 'paid' }, true);
  assert.equal(renewAgain.status, 409); step('second renewal of same subscription blocked');
  const detail = await api('GET', `/admin/subscriptions/${pending.subscription.id}`);
  assert.equal(detail.history.length, 2); assert.equal(detail.payments.length, 1); step('subscription detail has renewal chain history');

  // Renewal management screen
  const ren = await api('GET', '/admin/subscriptions/renewals?filter=7');
  assert.ok(ren.counters.d7 >= 1); step(`renewals screen: 7d=${ren.counters.d7} 15d=${ren.counters.d15} 30d=${ren.counters.d30} expired=${ren.counters.expired} pending=${ren.counters.pending} renewed=${ren.counters.renewed}`);

  // Status actions
  const susp = await api('POST', `/admin/subscriptions/${fam.subscription.id}/suspend`, { reason: 'Owner travelling' });
  assert.equal(susp.status, 'suspended');
  const res = await api('POST', `/admin/subscriptions/${fam.subscription.id}/resume`, {});
  assert.equal(res.status, 'active'); step('suspend / resume');
  const noReason = await api('POST', `/admin/subscriptions/${fam.subscription.id}/cancel`, {}, true);
  assert.equal(noReason.status, 422); step('cancel requires reason');

  // Vehicles list shows current subscription
  const vlist = await api('GET', `/admin/vehicles?search=QA%20${stamp}`);
  assert.equal(vlist.data[0].currentSubscriptionStatus, 'active'); step('vehicle list reflects current subscription');

  // Users & roles
  const rolesRes = await api('GET', '/admin/users/roles');
  const viewer = rolesRes.roles.find((r) => r.name === 'Viewer');
  const u = await api('POST', '/admin/users', { name: 'QA Viewer', email: `viewer${stamp}@carwash.local`, password: 'Viewer@12345', roleId: viewer.id });
  step('create viewer user');
  const adminToken = token;
  token = (await api('POST', '/auth/login', { email: `viewer${stamp}@carwash.local`, password: 'Viewer@12345' })).token;
  const forb = await api('POST', '/admin/compounds', { name: 'x', code: 'X' }, true);
  assert.equal(forb.status, 403); step('viewer cannot create compounds (RBAC)');
  assert.ok((await api('GET', '/admin/compounds')).data.length > 0); step('viewer can read compounds');
  token = adminToken;

  // Settings + audit
  await api('PUT', '/admin/settings/general', { expiringSoonDays: 10, defaultWashingDays: [0, 1, 2, 3, 4], weekStartsOn: 6 });
  const st = await api('GET', '/admin/settings');
  assert.equal(st.settings.general.expiringSoonDays, 10); step('settings saved');
  await api('PUT', '/admin/settings/general', { expiringSoonDays: 7, defaultWashingDays: [0, 1, 2, 3, 4, 5, 6], weekStartsOn: 6 });
  const audit = await api('GET', '/admin/audit-logs?pageSize=5');
  assert.ok(audit.data.length === 5 && audit.actions.includes('payment.approve')); step('audit logs recorded');
  const owners = await api('GET', '/admin/owners?search=QA');
  const od = await api('GET', `/admin/owners/${owners.data[0].id}`);
  assert.equal(od.vehicles.length, 2); step('owner detail lists both vehicles');
  console.log('\nALL API TESTS PASSED');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
