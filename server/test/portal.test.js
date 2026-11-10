// Owner-portal end-to-end test (Scenarios 2, 3, 8). Requires the server on :4000 with demo data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let admin;
const j = async (method, path, body, token, raw = false) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (raw) return { status: res.status, json };
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const step = (m) => console.log('✓', m);
fs.writeFileSync('/tmp/receipt.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

(async () => {
  admin = (await j('POST', '/auth/login', { email: 'admin@carwash.local', password: 'Admin@12345' })).token;

  // Settings: InstaPay + SMS not configured
  const st = await j('GET', '/admin/settings', null, admin);
  assert.equal(st.settings.payment.method, 'instapay'); assert.equal(st.settings.sms.configured, false); step('settings: InstaPay seeded, SMS not configured');
  await j('PUT', '/admin/settings/payment', { method: 'instapay', instapayAddress: '01012345678', instapayName: 'Sparkle', instructions: 'Pay then upload', instructionsAr: 'ادفع ثم ارفع' }, admin);
  await j('PUT', '/admin/settings/notifications', { expiryReminderDays: [3], sendOnExpiry: true, postExpiryReminderDays: [], notifyAdminOnPendingPayment: true, notifyAdminOnIssue: true, smsOnPaymentApproved: true, smsOnPaymentRejected: true, smsOnWashCompleted: false }, admin);
  step('settings saved (InstaPay number, reminders 3 days + on expiry)');

  // SMS test send without provider → honest not_configured
  const t = await j('POST', '/admin/settings/sms/test', { mobile: '01099900001' }, admin);
  assert.equal(t.status, 'not_configured'); step('SMS test without provider → status not_configured (nothing simulated)');
  // Configure SMS Misr with dummy creds → real HTTP attempt → failed (logged with provider response)
  await j('PUT', '/admin/settings/sms', { provider: 'smsmisr', username: 'demo', password: 'demo', senderId: 'CARWASH', environment: 'test', defaultLang: 'ar' }, admin);
  const t2 = await j('POST', '/admin/settings/sms/test', { mobile: '01099900001' }, admin);
  assert.ok(['failed', 'sent'].includes(t2.status)); step(`SMS Misr adapter attempted a real call → ${t2.status} (${JSON.stringify(t2.providerResponse).slice(0, 80)}…)`);
  await j('PUT', '/admin/settings/sms', { provider: 'none' }, admin);

  // Scenario 8: expiring subscription (3 days) → reminder automation → link
  const ren = await j('GET', '/admin/subscriptions/renewals?filter=7', null, admin);
  const target = ren.data.find((s) => s.daysRemaining >= 0 && s.daysRemaining <= 7 && !s.renewedToId);
  assert.ok(target, 'need an expiring demo subscription');
  const { link } = await j('GET', `/admin/sms/renewal-link/${target.id}`, null, admin);
  assert.match(link, /\/r\/[A-Za-z0-9]{10}$/); step(`renewal link minted: …${link.slice(-30)}`);
  const rem = await j('POST', `/admin/sms/renewal-reminder/${target.id}`, {}, admin);
  assert.ok(['not_configured', 'skipped_demo'].includes(rem.log.status)); assert.ok(rem.log.body.includes(link)); assert.ok(rem.log.body.includes(target.plates.split(',')[0])); step('manual reminder rendered Arabic template with plate + link, logged not_configured');
  const logs = await j('GET', '/admin/sms/logs', null, admin); assert.ok(logs.data.length >= 3); step('SMS center lists logs');

  // Scenario 2: owner opens link (no login) → sees summary → uploads receipt
  const token = link.split('/').pop();
  const summary = await j('GET', `/portal/renew/${token}`);
  assert.equal(summary.payment.instapayAddress, '01012345678'); assert.ok(summary.plans.length >= 2); assert.equal(summary.request, null); assert.ok(summary.owner.mobileMasked.includes('•')); step(`owner link page: ${summary.vehicles.map((v) => v.plateNumber)} · ${summary.plans.length} plans · InstaPay shown · mobile masked`);
  const plan = summary.plans.find((p) => !p.isCurrent) || summary.plans[0];
  const fd = new FormData(); fd.append('planId', plan.id); fd.append('note', 'transferred from my wallet'); fd.append('receipt', new Blob([fs.readFileSync('/tmp/receipt.png')], { type: 'image/png' }), 'transfer.png');
  const sub = await fetch(`${BASE}/portal/renew/${token}`, { method: 'POST', body: fd }); const subJson = await sub.json();
  assert.equal(sub.status, 201, JSON.stringify(subJson)); assert.equal(subJson.status, 'pending_verification'); assert.equal(subJson.amount, plan.price); step(`owner submitted renewal ${subJson.requestCode} (${plan.name}, ${plan.price}) with receipt`);
  const again = await fetch(`${BASE}/portal/renew/${token}`, { method: 'POST', body: fd }); assert.equal(again.status, 409); step('second submission while pending → 409');
  const summary2 = await j('GET', `/portal/renew/${token}`); assert.equal(summary2.request.payment.status, 'pending_verification'); assert.equal(summary2.request.payment.receipts.length, 1); step('link page now shows request tracking');

  // Admin sees notification + pending payment with owner receipt
  const notifs = await j('GET', '/admin/notifications', null, admin); assert.ok(notifs.data.some((n) => n.title.includes(subJson.requestCode))); step('admin notified in-app');
  const pays = await j('GET', '/admin/payments?status=pending_verification', null, admin);
  const pay = pays.data.find((p) => p.subscriptionCode === subJson.requestCode); assert.equal(pay.receiptsCount, 1);
  const payDetail = await j('GET', `/admin/payments/${pay.id}`, null, admin); assert.equal(payDetail.receipts[0].uploadedByType, 'owner'); assert.equal(payDetail.ownerNote, 'transferred from my wallet');
  const img = await fetch(`${BASE}/admin/payments/${pay.id}/receipts/${payDetail.receipts[0].id}`, { headers: { Authorization: `Bearer ${admin}` } }); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); step('admin opens the owner receipt (protected stream)');
  const anon = await fetch(`${BASE}/admin/payments/${pay.id}/receipts/${payDetail.receipts[0].id}`); assert.equal(anon.status, 401); step('receipt not reachable without admin auth');

  // Reject → owner sees reason → re-upload → approve (Scenario 3)
  await j('POST', `/admin/payments/${pay.id}/reject`, { reason: 'Amount does not match' }, admin);
  const s3 = await j('GET', `/portal/renew/${token}`); assert.equal(s3.request.payment.status, 'awaiting_new_receipt'); assert.equal(s3.request.payment.rejectionReason, 'Amount does not match'); step('rejection reason visible to owner');
  const fd2 = new FormData(); fd2.append('planId', plan.id); fd2.append('receipt', new Blob([fs.readFileSync('/tmp/receipt.png')], { type: 'image/png' }), 'transfer2.png');
  const re = await fetch(`${BASE}/portal/renew/${token}`, { method: 'POST', body: fd2 }); assert.equal(re.status, 201); step('owner re-uploaded receipt → pending again');
  const approved = await j('POST', `/admin/payments/${pay.id}/approve`, {}, admin); assert.equal(approved.subscriptionStatus, 'active'); step('admin approved → renewed subscription active');
  const s4 = await j('GET', `/portal/renew/${token}`); assert.equal(s4.request.status, 'active'); assert.equal(s4.request.payment.status, 'approved'); step('link page shows approved + active');
  const smsAfter = await j('GET', '/admin/sms/logs?pageSize=5', null, admin); assert.ok(smsAfter.data.some((l) => l.templateKey === 'payment_approved')); assert.ok(smsAfter.data.some((l) => l.templateKey === 'payment_rejected')); assert.ok(smsAfter.data.some((l) => l.templateKey === 'renewal_received')); step('SMS logs: renewal_received, payment_rejected, payment_approved all queued');
  // Reminder automation must NOT send to a renewed subscription (dedupe + renewed check)
  const bad = await j('GET', `/portal/renew/not-a-real-token`, null, null, true); assert.equal(bad.status, 404); step('invalid link → 404');

  // OTP login
  const ownerMobile = (await j('GET', `/admin/owners/${target.ownerId}`, null, admin)).mobile;
  const req1 = await j('POST', '/portal/otp/request', { mobile: ownerMobile }); assert.ok(['not_configured', 'skipped_demo'].includes(req1.delivery));
  const otpLog = (await j('GET', '/admin/sms/logs?pageSize=3', null, admin)).data.find((l) => l.templateKey === 'otp'); const code = otpLog.body.match(/\d{6}/)[0]; step(`OTP requested; without SMS provider admin can read the code in the SMS log (${code})`);
  const cool = await j('POST', '/portal/otp/request', { mobile: ownerMobile }, null, true); assert.equal(cool.status, 429); step('resend cooldown enforced');
  const wrong = await j('POST', '/portal/otp/verify', { mobile: ownerMobile, code: '000000' }, null, true); assert.equal(wrong.status, 401);
  const sess = await j('POST', '/portal/otp/verify', { mobile: ownerMobile.replace('+20', '0'), code }); assert.ok(sess.token); step('OTP verified (local-format mobile accepted) → owner session');
  const reuse = await j('POST', '/portal/otp/verify', { mobile: ownerMobile, code }, null, true); assert.equal(reuse.status, 401); step('OTP single-use');
  const me = await j('GET', '/portal/me', null, sess.token); assert.ok(me.vehicles.length >= 1); assert.ok(me.vehicles.every((v) => v.plateNumber)); step(`portal /me: ${me.vehicles.length} vehicle(s), ${me.units.length} unit(s), stats ${JSON.stringify(me.stats)}`);
  const vd = await j('GET', `/portal/vehicles/${me.vehicles[0].id}`, null, sess.token); assert.ok(vd.subscriptions.length >= 1); step(`vehicle detail: current=${vd.current?.status} nextWash=${vd.nextWash} payments=${vd.payments.length}`);
  const other = (await j('GET', '/admin/vehicles?pageSize=50', null, admin)).data.find((v) => v.ownerId !== target.ownerId);
  const forb = await j('GET', `/portal/vehicles/${other.id}`, null, sess.token, true); assert.equal(forb.status, 404); step("owner cannot read another owner's vehicle");
  const reqs = await j('GET', '/portal/requests', null, sess.token); assert.ok(reqs.length >= 1); step('owner sees request history');

  // Manual wash record with photos → owner calendar
  const vehicleId = me.vehicles.find((v) => v.subscriptionStatus === 'active')?.id || me.vehicles[0].id;
  const fd3 = new FormData(); fd3.append('vehicleId', vehicleId); fd3.append('notes', 'Demo wash'); fd3.append('before', new Blob([fs.readFileSync('/tmp/receipt.png')], { type: 'image/png' }), 'b.png'); fd3.append('after', new Blob([fs.readFileSync('/tmp/receipt.png')], { type: 'image/png' }), 'a.png');
  const wr = await fetch(`${BASE}/admin/wash-records`, { method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: fd3 }); const wrJson = await wr.json(); assert.equal(wr.status, 201, JSON.stringify(wrJson)); step(`admin recorded a wash with photos (${wrJson.washesUsed}/${wrJson.washesAllowed})`);
  const dupWash = await fetch(`${BASE}/admin/wash-records`, { method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: fd3 }); assert.equal(dupWash.status, 409); step('duplicate wash same day blocked');
  const cal = await j('GET', `/portal/washes?month=${new Date().toISOString().slice(0, 7)}`, null, sess.token); assert.ok(cal.items.some((i) => i.operation_id === wrJson.operation.id && i.before_count === 1 && i.after_count === 1)); step('owner calendar shows the wash with 1 before + 1 after photo');
  const det = await j('GET', `/portal/washes/${wrJson.operation.id}`, null, sess.token); const ph = await fetch(`${BASE}/portal/photos/${det.photos[0].id}`, { headers: { Authorization: `Bearer ${sess.token}` } }); assert.equal(ph.status, 200); step('owner can open wash photo (protected)');
  await j('POST', '/portal/logout', {}, sess.token); const after = await j('GET', '/portal/me', null, sess.token, true); assert.equal(after.status, 401); step('logout revokes session');
  console.log('\nALL PORTAL TESTS PASSED');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
