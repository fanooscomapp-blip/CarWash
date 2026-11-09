import assert from 'node:assert/strict';
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const j = async (method, path, body, token, raw = false) => { const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const json = await res.json().catch(() => ({})); if (raw) return { status: res.status, json }; if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`); return json; };
const step = (m) => console.log('✓', m);
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const multipart = async (path, token, fields = {}, photos = 1, raw = false) => {
  const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
  for (let i = 0; i < photos; i++) fd.append('photos', new Blob([PNG], { type: 'image/png' }), `p${i}.png`);
  const res = await fetch(BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }); const json = await res.json().catch(() => ({}));
  if (raw) return { status: res.status, json }; if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${JSON.stringify(json)}`); return json;
};
const todayCairo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

(async () => {
  const admin = (await j('POST', '/auth/login', { email: 'admin@carwash.local', password: 'Admin@12345' })).token;
  const bad = await j('POST', '/s/login', { employeeCode: 'EMP-001', pin: '9999' }, null, true); assert.equal(bad.status, 401); step('wrong PIN rejected');
  const login = await j('POST', '/s/login', { employeeCode: 'emp-001', pin: '1234' }); assert.ok(login.token); step(`staff login OK (${login.user.name})`);
  const st = login.token;
  const adminOnStaff = await j('GET', '/admin/dashboard', null, st, true); assert.equal(adminOnStaff.status, 403); step('staff token cannot open the admin portal');
  const me = await j('GET', '/s/me', null, st); assert.ok(me.outcomes.length >= 4 && me.compounds.length >= 1); step(`me: ${me.compounds.map((c) => c.name).join(', ')} · ${me.outcomes.length} outcomes`);

  // Make sure today has tasks
  await j('POST', '/admin/staff/board/distribute', { date: todayCairo() }, admin);
  let tasks = (await j('GET', '/s/tasks', null, st)).tasks;
  const mineToday = tasks.filter((x) => x.assigned_to === login.user.id && x.date === todayCairo());
  assert.ok(mineToday.length >= 2, 'need ≥2 tasks today for EMP-001'); step(`today: ${mineToday.length} tasks for me (${tasks.length} visible incl. tomorrow/pool)`);
  const T = mineToday[0];
  assert.ok(T.plate_number && T.unit_number && T.vehicle_type); step('card has plate/unit/body type');

  // Finish before start → 400 ; start without photo → 422
  assert.equal((await multipart(`/s/tasks/${T.id}/finish`, st, {}, 1, true)).status, 400); step('finish before start rejected');
  assert.equal((await multipart(`/s/tasks/${T.id}/start`, st, {}, 0, true)).status, 422); step('start without before-photo rejected');
  const started = await multipart(`/s/tasks/${T.id}/start`, st, { lat: 30.01, lng: 31.2 }, 1); assert.ok(started.operationId && started.photoIds.length === 1); step('started with 1 before photo (timer running)');
  const again = await multipart(`/s/tasks/${T.id}/start`, st, {}, 1); assert.equal(again.operationId, started.operationId); step('second start call just adds a photo (idempotent operation)');
  await multipart(`/s/tasks/${T.id}/photos`, st, { phase: 'after' }, 1); step('extra after photo uploaded via /photos (background retry path)');
  const subBefore = (await j('GET', `/admin/subscriptions/${(await j('GET', `/admin/vehicles/${T.vehicle_id}`, null, admin)).subscriptions[0].id}`, null, admin));
  const fin = await multipart(`/s/tasks/${T.id}/finish`, st, { notes: 'ok' }, 1); assert.ok(fin.durationMin >= 0 && fin.washesUsed === subBefore.washesUsed + 1); step(`finished: ${fin.durationMin} min, washes ${fin.washesUsed}/${fin.washesAllowed} (+1)`);
  assert.equal((await multipart(`/s/tasks/${T.id}/finish`, st, {}, 1, true)).status, 409); step('double finish rejected');
  tasks = (await j('GET', '/s/tasks', null, st)).tasks; const t1 = tasks.find((x) => x.id === T.id);
  assert.equal(t1.status, 'completed'); assert.equal(t1.photos.length, 4); step('task shows completed with 4 photos');
  const img = await fetch(`${BASE}/s/photos/${t1.photos[0].id}`, { headers: { Authorization: `Bearer ${st}` } }); assert.equal(img.status, 200); step('photo streams for staff');

  // Outcome on second task: damage requires photo
  const T2 = mineToday[1];
  assert.equal((await multipart(`/s/tasks/${T2.id}/outcome`, st, { outcome: 'damage' }, 0, true)).status, 422); step('damage without photo rejected');
  await multipart(`/s/tasks/${T2.id}/outcome`, st, { outcome: 'not_found', note: 'parking empty' }, 0); step('outcome not_found saved');
  tasks = (await j('GET', '/s/tasks', null, st)).tasks; assert.equal(tasks.find((x) => x.id === T2.id).status, 'skipped'); step('task skipped');
  const notif = await j('GET', '/admin/notifications', null, admin); assert.ok((notif.data || notif).some((n) => n.type === 'wash.outcome')); step('admin notified about outcome');

  // Someone else's task → 403
  const others = tasks.filter((x) => x.assigned_to && x.assigned_to !== login.user.id);
  const otherLogin = await j('POST', '/s/login', { employeeCode: 'EMP-003', pin: '1234' });
  const his = (await j('GET', '/s/tasks', null, otherLogin.token)).tasks.find((x) => x.assigned_to === otherLogin.user.id && x.date === todayCairo());
  if (his) { assert.equal((await multipart(`/s/tasks/${his.id}/start`, st, {}, 1, true)).status, 403); step('cannot start a colleague\'s task'); }

  // Pool claim: admin unassigns one of Youssef's tasks → pool → Youssef claims back
  if (his) {
    await j('POST', `/admin/staff/board/tasks/${his.id}/assign`, { userId: null }, admin);
    const poolView = (await j('GET', '/s/tasks', null, otherLogin.token)).tasks.find((x) => x.id === his.id); assert.ok(poolView && !poolView.assigned_to); step('unassigned task visible in pool');
    await j('POST', `/s/tasks/${his.id}/claim`, null, otherLogin.token);
    const claimed = (await j('GET', '/s/tasks', null, otherLogin.token)).tasks.find((x) => x.id === his.id); assert.equal(claimed.assigned_to, otherLogin.user.id); step('claimed from pool');
    assert.equal((await j('POST', `/s/tasks/${his.id}/claim`, null, st, true)).status, 409); step('double claim rejected');
  }
  // Board reflects everything
  const board = await j('GET', `/admin/staff/board?date=${todayCairo()}`, null, admin);
  assert.ok(board.tasks.find((x) => x.id === T.id).status === 'completed' && board.tasks.find((x) => x.id === T.id).photos === 4); step('admin board shows completed task with photos + duration');
  console.log('\nALL STAFF APP TESTS PASSED');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
