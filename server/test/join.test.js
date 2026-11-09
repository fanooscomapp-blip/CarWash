import assert from 'node:assert/strict';
import fs from 'node:fs';
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const j = async (method, path, body, token, raw = false) => { const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const json = await res.json().catch(() => ({})); if (raw) return { status: res.status, json }; if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`); return json; };
const step = (m) => console.log('✓', m);
const stamp = Date.now().toString().slice(-6);
fs.writeFileSync('/tmp/receipt.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const submit = async (fields) => { const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v)); fd.append('receipt', new Blob([fs.readFileSync('/tmp/receipt.png')], { type: 'image/png' }), 'r.png'); const res = await fetch(`${BASE}/portal/join`, { method: 'POST', body: fd }); return { status: res.status, json: await res.json() }; };

(async () => {
  const admin = (await j('POST', '/auth/login', { email: 'admin@carwash.local', password: 'Admin@12345' })).token;
  await j('PUT', '/admin/settings/payment', { method: 'instapay', instapayAddress: '01012345678', instapayName: 'Sparkle', instapayLink: 'https://ipn.eg/S/sparkle/instapay/AbCdEf', instructions: '', instructionsAr: '' }, admin);
  await j('PUT', '/admin/settings/portal', { baseUrl: '', sessionDays: 30, linkValidDays: 30, selfRegistration: true, joinMaxPerHour: 100 }, admin);
  const cfg = await j('GET', '/portal/join/config');
  assert.ok(cfg.compounds.length >= 3 && cfg.plans.length >= 2 && cfg.payment.instapayLink.includes('ipn.eg')); step(`join config: ${cfg.compounds.length} compounds, ${cfg.plans.length} plans, InstaPay link present`);
  const compound = cfg.compounds[0]; const plan = cfg.plans.find((p) => p.scope === 'per_vehicle' && p.durationDays >= 30); const family = cfg.plans.find((p) => p.scope === 'multi_vehicle');

  const base = { compoundId: compound.id, ownerName: 'Join Tester', mobile: `0150${stamp}1`, unitNumber: `J-${stamp.slice(-3)}`, planId: plan.id, vehicles: [{ plateNumber: `JN ${stamp}`, brand: 'Kia', model: 'Cerato', color: 'white', vehicleType: 'sedan' }] };
  const smsCountBefore = (await j('GET', '/admin/sms/logs?pageSize=1', null, admin)).pagination.total;
  const r1 = await submit(base); assert.equal(r1.status, 201, JSON.stringify(r1.json)); assert.match(r1.json.requestCode, /^REG-/); step(`submitted ${r1.json.requestCode} amount ${r1.json.amount} (no OTP, no SMS)`);
  assert.equal((await j('GET', '/admin/sms/logs?pageSize=1', null, admin)).pagination.total, smsCountBefore); step('no SMS sent on submission');
  const dupMobile = await submit(base); assert.equal(dupMobile.status, 409); assert.ok(dupMobile.json.error.message.includes('pending')); step('second request from same mobile while pending → 409');
  const existingPlate = (await j('GET', '/admin/vehicles?pageSize=1', null, admin)).data[0].plateNumber;
  const dupPlate = await submit({ ...base, mobile: `0150${stamp}2`, vehicles: [{ plateNumber: existingPlate, vehicleType: 'sedan' }] }); assert.equal(dupPlate.status, 409); step('plate already registered → 409 immediately');
  const takenUnit = (await j('GET', `/admin/units?compoundId=${compound.id}&pageSize=1`, null, admin)).data[0].unitNumber;
  const dupUnit = await submit({ ...base, mobile: `0150${stamp}3`, unitNumber: takenUnit, vehicles: [{ plateNumber: `JU ${stamp}`, vehicleType: 'sedan' }] }); assert.equal(dupUnit.status, 409); step("unit registered to someone else → 409");
  const twoCars = await submit({ ...base, mobile: `0150${stamp}4`, unitNumber: `J2-${stamp.slice(-3)}`, vehicles: [{ plateNumber: `JA ${stamp}` }, { plateNumber: `JB ${stamp}` }] }); assert.equal(twoCars.status, 422); step('two vehicles on per-vehicle plan → 422');
  const fam = await submit({ ...base, mobile: `0150${stamp}4`, unitNumber: `J2-${stamp.slice(-3)}`, planId: family.id, vehicles: [{ plateNumber: `JA ${stamp}`, vehicleType: 'suv' }, { plateNumber: `JB ${stamp}` }] }); assert.equal(fam.status, 201); step('two vehicles on family plan → accepted');

  const st = await j('GET', `/portal/join/status/${r1.json.statusToken}`); assert.equal(st.status, 'pending'); step('applicant status page: pending');
  const notifs = await j('GET', '/admin/notifications', null, admin); assert.ok(notifs.data.some((n) => n.title.includes(r1.json.requestCode))); step('admin notified');

  const list = await j('GET', '/admin/registration-requests?status=pending', null, admin); const row = list.data.find((x) => x.requestCode === r1.json.requestCode); assert.ok(row && list.counters.pending >= 2); step(`admin list: ${list.counters.pending} pending`);
  const rc = await fetch(`${BASE}/admin/registration-requests/${row.id}/receipt`, { headers: { Authorization: `Bearer ${admin}` } }); assert.equal(rc.status, 200); step('admin can view receipt');
  const anon = await fetch(`${BASE}/admin/registration-requests/${row.id}/receipt`); assert.equal(anon.status, 401); step('receipt protected');
  // Edit typo then approve
  await j('PUT', `/admin/registration-requests/${row.id}`, { vehicles: [{ ...row.vehicles[0], plateNumber: `JN ${stamp}X`, model: 'Cerato 2024' }] }, admin); step('admin corrected plate before approval');
  const ap = await j('POST', `/admin/registration-requests/${row.id}/approve`, {}, admin); assert.ok(ap.subscriptionId); step('approved → owner + unit + vehicle + subscription created');
  const again = await j('POST', `/admin/registration-requests/${row.id}/approve`, {}, admin, true); assert.equal(again.status, 409); step('double approval blocked');
  const sub = await j('GET', `/admin/subscriptions/${ap.subscriptionId}`, null, admin); assert.equal(sub.status, 'active'); assert.equal(sub.plates, `JN ${stamp}X`); assert.equal(sub.payments[0].status, 'approved'); assert.equal(sub.payments[0].receipts.length, 1); step(`subscription ${sub.subscriptionCode} active, paid, receipt attached, plate corrected`);
  const owner = await j('GET', `/admin/owners/${ap.ownerId}`, null, admin); assert.equal(owner.units.length, 1); assert.equal(owner.mobile, `+20150${stamp}1`); step('owner file created with canonical mobile');
  const sms = (await j('GET', '/admin/sms/logs?pageSize=3', null, admin)).data.find((l) => l.templateKey === 'registration_approved'); assert.ok(sms && sms.body.includes('/p/login')); step('exactly one SMS: welcome message with portal link');
  const st2 = await j('GET', `/portal/join/status/${r1.json.statusToken}`); assert.equal(st2.status, 'approved'); assert.ok(st2.renewalLink); step('applicant status page: approved + link');

  const famRow = (await j('GET', '/admin/registration-requests?status=pending', null, admin)).data.find((x) => x.requestCode === fam.json.requestCode);
  await j('POST', `/admin/registration-requests/${famRow.id}/reject`, { reason: 'Receipt unreadable' }, admin);
  const st3 = await j('GET', `/portal/join/status/${fam.json.statusToken}`); assert.equal(st3.status, 'rejected'); assert.equal(st3.rejectionReason, 'Receipt unreadable'); step('rejected request shows reason to applicant');
  const resubmit = await submit({ ...base, mobile: `0150${stamp}4`, unitNumber: `J2-${stamp.slice(-3)}`, planId: family.id, vehicles: [{ plateNumber: `JA ${stamp}` }, { plateNumber: `JB ${stamp}` }] }); assert.equal(resubmit.status, 201); step('applicant can submit again after rejection');
  // Settings toggle
  await j('PUT', '/admin/settings/portal', { baseUrl: '', sessionDays: 30, linkValidDays: 30, selfRegistration: false, joinMaxPerHour: 5 }, admin);
  const closed = await j('GET', '/portal/join/config', null, null, true); assert.equal(closed.status, 403); step('self-registration can be switched off');
  await j('PUT', '/admin/settings/portal', { baseUrl: '', sessionDays: 30, linkValidDays: 30, selfRegistration: true, joinMaxPerHour: 5 }, admin);
  console.log('\nALL JOIN TESTS PASSED');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
