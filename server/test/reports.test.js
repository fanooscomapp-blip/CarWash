import assert from 'node:assert/strict';
const BASE = process.env.API_URL || 'http://localhost:4000/api';
const step = (m) => console.log('✓', m);
(async () => {
  const admin = (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@carwash.local', password: 'Admin@12345' }) })).json()).token;
  const H = { Authorization: `Bearer ${admin}` };
  const list = await (await fetch(BASE + '/admin/reports?lang=ar', { headers: H })).json(); assert.equal(list.length, 6); step(`6 reports: ${list.map((r) => r.title).join(' | ')}`);
  for (const r of list) {
    const d = await (await fetch(`${BASE}/admin/reports/${r.key}?lang=en`, { headers: H })).json();
    assert.ok(Array.isArray(d.rows) && d.columns.length >= 5, r.key); for (const row of d.rows) for (const c of d.columns) assert.ok(c.key in row, `${r.key}: missing ${c.key}`);
    step(`${r.key}: ${d.rows.length} rows, ${d.columns.length} columns, summary ${JSON.stringify(d.summary).slice(0, 80)}`);
    const x = await fetch(`${BASE}/admin/reports/${r.key}/export?lang=ar`, { headers: H }); assert.equal(x.status, 200); assert.ok((x.headers.get('content-type') || '').includes('spreadsheetml')); const buf = Buffer.from(await x.arrayBuffer()); assert.ok(buf.length > 2000 && buf.slice(0, 2).toString() === 'PK'); step(`${r.key}: xlsx export ${buf.length} bytes`);
  }
  const bad = await fetch(`${BASE}/admin/reports/nope`, { headers: H }); assert.equal(bad.status, 400); step('unknown report → 400');
  const filtered = await (await fetch(`${BASE}/admin/reports/revenue?status=approved&from=2000-01-01&to=2000-01-02`, { headers: H })).json(); assert.equal(filtered.rows.length, 0); step('date filter applied');
  console.log('\nALL REPORTS TESTS PASSED');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
