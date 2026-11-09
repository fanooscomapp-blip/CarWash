/**
 * Reports: each report = one SQL query with the same filters (compound, date range, plan, status…) returned as
 *   GET /admin/reports/:key           → { columns, rows, summary }
 *   GET /admin/reports/:key/export    → .xlsx (same filters), built with exceljs
 * Column labels are sent in the requested language (?lang=ar|en) so the Excel header matches the UI.
 */
import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '../db/index.js';
import { wrap, badRequest } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { today, addDays } from '../lib/util.js';

const router = Router();
const rows = (r) => r.rows || r;
const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysText = (arr, lang) => (Array.isArray(arr) ? [6, 0, 1, 2, 3, 4, 5].filter((d) => arr.includes(d)).map((d) => (lang === 'ar' ? DAY_AR : DAY_EN)[d]).join(' · ') : '');
const STATUS_AR = { active: 'فعّال', expiring_soon: 'قريب الانتهاء', expired: 'منتهي', pending_payment: 'بانتظار الدفع', cancelled: 'ملغي', suspended: 'موقوف', completed: 'مكتمل', skipped: 'لم تُغسل', assigned: 'موزَّع', accepted: 'مقبول', in_progress: 'جارٍ', cancelled_task: 'ملغي', approved: 'معتمد', rejected: 'مرفوض', pending_verification: 'بانتظار المراجعة', awaiting_new_receipt: 'بانتظار إيصال جديد', cash: 'كاش', bank_transfer: 'تحويل/انستاباي', other: 'أخرى' };
const label = (v, lang) => (lang === 'ar' ? STATUS_AR[v] || v : v);

const filterSchema = z.object({
  compoundId: z.string().uuid().optional(), planId: z.string().uuid().optional(), status: z.string().max(40).optional(), staffId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), lang: z.enum(['ar', 'en']).optional().default('en'), days: z.coerce.number().int().min(1).max(365).optional(),
});

// column: { key, ar, en, type?: 'number'|'money'|'date'|'text', width? }
const C = (key, en, ar, type = 'text', width) => ({ key, en, ar, type, width });

const REPORTS = {
  subscriptions: {
    en: 'Subscriptions', ar: 'الاشتراكات',
    columns: [C('subscription_code', 'Code', 'الكود', 'text', 14), C('status', 'Status', 'الحالة'), C('owner_name', 'Owner', 'المالك', 'text', 22), C('mobile', 'Mobile', 'الموبايل', 'text', 16), C('compound_name', 'Compound', 'الكمبوند', 'text', 18), C('unit_number', 'Unit', 'الوحدة'), C('plates', 'Vehicles', 'السيارات', 'text', 22), C('plan_name', 'Plan', 'الباقة', 'text', 24), C('start_date', 'Start', 'البداية', 'date'), C('end_date', 'End', 'النهاية', 'date'), C('washes_used', 'Used', 'المستخدمة', 'number'), C('washes_allowed', 'Allowed', 'المسموح', 'number'), C('wash_days', 'Wash days', 'أيام الغسيل', 'text', 26), C('final_amount', 'Amount', 'المبلغ', 'money'), C('payment_status', 'Payment', 'الدفع')],
    query: (cid, f) => sql`
      SELECT s.subscription_code, s.status, o.name AS owner_name, o.mobile, c.name AS compound_name, u.unit_number,
        (SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = s.id) AS plates,
        s.plan_snapshot->>'name' AS plan_name, s.start_date::text, s.end_date::text, s.washes_used, s.washes_allowed, s.allowed_days AS wash_days, s.final_amount::float, s.payment_status
      FROM subscriptions s JOIN owners o ON o.id = s.owner_id JOIN compounds c ON c.id = s.compound_id JOIN units u ON u.id = s.unit_id
      WHERE s.company_id = ${cid} ${f.compoundId ? sql`AND s.compound_id = ${f.compoundId}` : sql``} ${f.planId ? sql`AND s.plan_id = ${f.planId}` : sql``} ${f.status ? sql`AND s.status = ${f.status}` : sql``}
        ${f.from ? sql`AND s.end_date >= ${f.from}` : sql``} ${f.to ? sql`AND s.start_date <= ${f.to}` : sql``}
      ORDER BY s.end_date DESC, s.subscription_code DESC`,
    post: (r, lang) => r.map((x) => ({ ...x, wash_days: daysText(x.wash_days, lang), status: label(x.status, lang), payment_status: label(x.payment_status, lang) })),
    summary: (r) => ({ count: r.length, amount: r.reduce((a, x) => a + (x.final_amount || 0), 0), used: r.reduce((a, x) => a + x.washes_used, 0), allowed: r.reduce((a, x) => a + x.washes_allowed, 0) }),
  },
  revenue: {
    en: 'Revenue & payments', ar: 'الإيرادات والمدفوعات',
    columns: [C('payment_code', 'Payment', 'رقم الدفعة', 'text', 14), C('payment_date', 'Date', 'التاريخ', 'date'), C('month', 'Month', 'الشهر'), C('owner_name', 'Owner', 'المالك', 'text', 22), C('compound_name', 'Compound', 'الكمبوند', 'text', 18), C('plan_name', 'Plan', 'الباقة', 'text', 24), C('subscription_code', 'Subscription', 'الاشتراك', 'text', 14), C('method', 'Method', 'الطريقة'), C('status', 'Status', 'الحالة'), C('amount', 'Amount', 'المبلغ', 'money')],
    query: (cid, f) => sql`
      SELECT p.payment_code, coalesce(p.payment_date, p.created_at::date)::text AS payment_date, to_char(coalesce(p.payment_date, p.created_at::date), 'YYYY-MM') AS month, o.name AS owner_name, c.name AS compound_name,
        s.plan_snapshot->>'name' AS plan_name, s.subscription_code, p.method, p.status, p.amount::float
      FROM payments p JOIN owners o ON o.id = p.owner_id JOIN compounds c ON c.id = p.compound_id JOIN subscriptions s ON s.id = p.subscription_id
      WHERE p.company_id = ${cid} ${f.compoundId ? sql`AND p.compound_id = ${f.compoundId}` : sql``} ${f.planId ? sql`AND s.plan_id = ${f.planId}` : sql``} ${f.status ? sql`AND p.status = ${f.status}` : sql`AND p.status = 'approved'`}
        ${f.from ? sql`AND coalesce(p.payment_date, p.created_at::date) >= ${f.from}` : sql``} ${f.to ? sql`AND coalesce(p.payment_date, p.created_at::date) <= ${f.to}` : sql``}
      ORDER BY payment_date DESC`,
    post: (r, lang) => r.map((x) => ({ ...x, method: label(x.method, lang), status: label(x.status, lang) })),
    summary: (r) => { const byMonth = {}, byMethod = {}, byCompound = {}; r.forEach((x) => { byMonth[x.month] = (byMonth[x.month] || 0) + x.amount; byMethod[x.method] = (byMethod[x.method] || 0) + x.amount; byCompound[x.compound_name] = (byCompound[x.compound_name] || 0) + x.amount; }); return { count: r.length, amount: r.reduce((a, x) => a + x.amount, 0), byMonth, byMethod, byCompound }; },
  },
  operations: {
    en: 'Washing operations', ar: 'عمليات الغسيل',
    columns: [C('date', 'Date', 'التاريخ', 'date'), C('compound_name', 'Compound', 'الكمبوند', 'text', 18), C('tasks', 'Tasks', 'المهام', 'number'), C('completed', 'Completed', 'منجز', 'number'), C('skipped', 'Not washed', 'لم تُغسل', 'number'), C('cancelled', 'Cancelled', 'ملغاة', 'number'), C('pending', 'Open', 'مفتوحة', 'number'), C('avg_minutes', 'Avg. minutes', 'متوسط الدقائق', 'number'), C('outcomes', 'Not-washed reasons', 'أسباب عدم الغسيل', 'text', 30)],
    query: (cid, f) => sql`
      SELECT t.scheduled_date::text AS date, c.name AS compound_name, count(*)::int AS tasks,
        count(*) FILTER (WHERE t.status = 'completed')::int AS completed, count(*) FILTER (WHERE t.status = 'skipped')::int AS skipped, count(*) FILTER (WHERE t.status = 'cancelled')::int AS cancelled,
        count(*) FILTER (WHERE t.status IN ('assigned','accepted','in_progress'))::int AS pending,
        round(avg(EXTRACT(EPOCH FROM (op.end_time - op.start_time)) / 60) FILTER (WHERE t.status = 'completed' AND op.end_time IS NOT NULL))::int AS avg_minutes,
        (SELECT string_agg(o2.outcome || ' ×' || o2.n, ', ') FROM (SELECT t2.outcome, count(*) AS n FROM washing_tasks t2 WHERE t2.compound_id = t.compound_id AND t2.scheduled_date = t.scheduled_date AND t2.status = 'skipped' GROUP BY t2.outcome) o2) AS outcomes
      FROM washing_tasks t JOIN compounds c ON c.id = t.compound_id LEFT JOIN washing_operations op ON op.task_id = t.id
      WHERE t.company_id = ${cid} ${f.compoundId ? sql`AND t.compound_id = ${f.compoundId}` : sql``} AND t.scheduled_date BETWEEN ${f.from || addDays(today(), -30)} AND ${f.to || today()}
      GROUP BY t.scheduled_date, t.compound_id, c.name ORDER BY t.scheduled_date DESC, c.name`,
    summary: (r) => ({ tasks: r.reduce((a, x) => a + x.tasks, 0), completed: r.reduce((a, x) => a + x.completed, 0), skipped: r.reduce((a, x) => a + x.skipped, 0), avgMinutes: Math.round(r.filter((x) => x.avg_minutes).reduce((a, x) => a + x.avg_minutes, 0) / Math.max(1, r.filter((x) => x.avg_minutes).length)) }),
  },
  staff: {
    en: 'Staff performance', ar: 'أداء العمال',
    columns: [C('name', 'Staff', 'العامل', 'text', 22), C('employee_code', 'Code', 'الكود'), C('compounds', 'Compounds', 'الكمبوندات', 'text', 26), C('work_days', 'Scheduled days', 'أيام مجدولة', 'number'), C('leave_days', 'Leave days', 'أيام إجازة', 'number'), C('tasks', 'Tasks', 'المهام', 'number'), C('completed', 'Completed', 'منجز', 'number'), C('skipped', 'Not washed', 'لم تُغسل', 'number'), C('completion_rate', 'Completion %', 'نسبة الإنجاز', 'percent'), C('avg_minutes', 'Avg. minutes', 'متوسط الدقائق', 'number'), C('photos', 'Photos', 'الصور', 'number')],
    query: (cid, f) => { const from = f.from || addDays(today(), -30), to = f.to || today(); return sql`
      SELECT u.name, u.employee_code, (SELECT string_agg(c.name, ', ') FROM staff_compounds sc JOIN compounds c ON c.id = sc.compound_id WHERE sc.user_id = u.id) AS compounds,
        (SELECT count(*) FROM generate_series(${from}::date, ${to}::date, '1 day') d WHERE EXISTS (SELECT 1 FROM staff_schedule ss WHERE ss.user_id = u.id AND ss.dow = extract(dow FROM d)::int))::int AS work_days,
        (SELECT coalesce(sum(least(l.end_date, ${to}::date) - greatest(l.start_date, ${from}::date) + 1), 0) FROM staff_leaves l WHERE l.user_id = u.id AND l.end_date >= ${from}::date AND l.start_date <= ${to}::date)::int AS leave_days,
        count(t.id)::int AS tasks, count(t.id) FILTER (WHERE t.status = 'completed')::int AS completed, count(t.id) FILTER (WHERE t.status = 'skipped')::int AS skipped,
        CASE WHEN count(t.id) FILTER (WHERE t.status <> 'cancelled') = 0 THEN 0 ELSE round(100.0 * count(t.id) FILTER (WHERE t.status = 'completed') / count(t.id) FILTER (WHERE t.status <> 'cancelled')) END::int AS completion_rate,
        round(avg(EXTRACT(EPOCH FROM (op.end_time - op.start_time)) / 60) FILTER (WHERE t.status = 'completed' AND op.end_time IS NOT NULL))::int AS avg_minutes,
        (SELECT count(*) FROM wash_photos p JOIN washing_operations o2 ON o2.id = p.operation_id WHERE o2.staff_id = u.id AND o2.start_time::date BETWEEN ${from}::date AND ${to}::date)::int AS photos
      FROM users u LEFT JOIN washing_tasks t ON t.assigned_to = u.id AND t.scheduled_date BETWEEN ${from} AND ${to} ${f.compoundId ? sql`AND t.compound_id = ${f.compoundId}` : sql``} LEFT JOIN washing_operations op ON op.task_id = t.id
      WHERE u.company_id = ${cid} AND u.user_type = 'staff' AND u.is_active = true ${f.staffId ? sql`AND u.id = ${f.staffId}` : sql``}
      GROUP BY u.id ORDER BY completed DESC, u.name`; },
    summary: (r) => ({ staff: r.length, tasks: r.reduce((a, x) => a + x.tasks, 0), completed: r.reduce((a, x) => a + x.completed, 0) }),
  },
  followup: {
    en: 'Follow-up: expiring & expired (not renewed)', ar: 'متابعة: قريبة الانتهاء والمنتهية غير المجدَّدة',
    columns: [C('owner_name', 'Owner', 'المالك', 'text', 22), C('mobile', 'Mobile', 'الموبايل', 'text', 16), C('compound_name', 'Compound', 'الكمبوند', 'text', 18), C('unit_number', 'Unit', 'الوحدة'), C('plates', 'Vehicles', 'السيارات', 'text', 22), C('plan_name', 'Plan', 'الباقة', 'text', 24), C('end_date', 'End', 'النهاية', 'date'), C('days_left', 'Days left', 'الأيام المتبقية', 'number'), C('status', 'Status', 'الحالة'), C('reminders', 'SMS reminders sent', 'تذكيرات مرسلة', 'number'), C('last_sms', 'Last SMS', 'آخر رسالة', 'date')],
    query: (cid, f) => sql`
      SELECT o.name AS owner_name, o.mobile, c.name AS compound_name, u.unit_number,
        (SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = s.id) AS plates,
        s.plan_snapshot->>'name' AS plan_name, s.end_date::text, (s.end_date - CURRENT_DATE)::int AS days_left, s.status,
        (SELECT count(*) FROM subscription_reminders r WHERE r.subscription_id = s.id)::int AS reminders,
        (SELECT max(l.created_at)::date::text FROM sms_logs l WHERE l.owner_id = o.id AND l.status = 'sent') AS last_sms
      FROM subscriptions s JOIN owners o ON o.id = s.owner_id JOIN compounds c ON c.id = s.compound_id JOIN units u ON u.id = s.unit_id
      WHERE s.company_id = ${cid} AND s.payment_status = 'paid' ${f.compoundId ? sql`AND s.compound_id = ${f.compoundId}` : sql``}
        AND ((s.status IN ('active','expiring_soon') AND s.end_date <= CURRENT_DATE + ${f.days || 15}::int) OR s.status = 'expired')
        AND NOT EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id = s.id AND s2.status <> 'cancelled')
      ORDER BY s.end_date`,
    post: (r, lang) => r.map((x) => ({ ...x, status: label(x.status, lang) })),
    summary: (r) => ({ count: r.length, expired: r.filter((x) => x.days_left < 0).length, expiring: r.filter((x) => x.days_left >= 0).length }),
  },
  owners: {
    en: 'Owners & vehicles', ar: 'الملاك والسيارات',
    columns: [C('owner_name', 'Owner', 'المالك', 'text', 22), C('mobile', 'Mobile', 'الموبايل', 'text', 16), C('compound_name', 'Compound', 'الكمبوند', 'text', 18), C('unit_number', 'Unit', 'الوحدة'), C('plate_number', 'Plate', 'اللوحة', 'text', 14), C('brand', 'Brand', 'الماركة'), C('model', 'Model', 'الموديل'), C('color', 'Color', 'اللون'), C('vehicle_type', 'Body', 'الشكل'), C('parking_location', 'Parking', 'مكان الركنة', 'text', 22), C('gps', 'GPS', 'GPS', 'text', 22), C('sub_status', 'Subscription', 'الاشتراك'), C('end_date', 'Ends', 'ينتهي', 'date')],
    query: (cid, f) => sql`
      SELECT o.name AS owner_name, o.mobile, c.name AS compound_name, u.unit_number, v.plate_number, v.brand, v.model, v.color, v.vehicle_type, v.parking_location,
        CASE WHEN v.gps_lat IS NOT NULL THEN v.gps_lat::text || ',' || v.gps_lng::text END AS gps,
        (SELECT s.status FROM subscription_vehicles sv JOIN subscriptions s ON s.id = sv.subscription_id WHERE sv.vehicle_id = v.id AND s.status IN ('active','expiring_soon','pending_payment','expired') ORDER BY s.end_date DESC LIMIT 1) AS sub_status,
        (SELECT s.end_date::text FROM subscription_vehicles sv JOIN subscriptions s ON s.id = sv.subscription_id WHERE sv.vehicle_id = v.id ORDER BY s.end_date DESC LIMIT 1) AS end_date
      FROM vehicles v JOIN owners o ON o.id = v.owner_id JOIN compounds c ON c.id = v.compound_id JOIN units u ON u.id = v.unit_id
      WHERE v.company_id = ${cid} AND v.status = 'active' ${f.compoundId ? sql`AND v.compound_id = ${f.compoundId}` : sql``}
      ORDER BY c.name, u.unit_number, o.name`,
    post: (r, lang) => r.map((x) => ({ ...x, sub_status: x.sub_status ? label(x.sub_status, lang) : (lang === 'ar' ? 'بدون اشتراك' : 'none') })),
    summary: (r) => ({ vehicles: r.length, owners: new Set(r.map((x) => x.mobile)).size, withLocation: r.filter((x) => x.parking_location || x.gps).length }),
  },
};

async function run(req, key) {
  const def = REPORTS[key]; if (!def) throw badRequest('Unknown report');
  const f = filterSchema.parse(req.query);
  let data = rows(await db.execute(def.query(req.companyId, f)));
  if (def.post) data = def.post(data, f.lang);
  return { def, f, data, columns: def.columns.map((c) => ({ key: c.key, label: c[f.lang], type: c.type })), summary: def.summary ? def.summary(data) : {} };
}

router.get('/', requirePermission('reports.view'), wrap(async (req, res) => {
  const lang = req.query.lang === 'ar' ? 'ar' : 'en';
  res.json(Object.entries(REPORTS).map(([key, d]) => ({ key, title: d[lang] })));
}));

router.get('/:key', requirePermission('reports.view'), wrap(async (req, res) => {
  const { def, data, columns, summary, f } = await run(req, req.params.key);
  res.json({ key: req.params.key, title: def[f.lang], columns, rows: data, summary, generatedAt: new Date().toISOString() });
}));

router.get('/:key/export', requirePermission('reports.view'), wrap(async (req, res) => {
  const { def, data, columns, summary, f } = await run(req, req.params.key);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Car Wash Management';
  const ws = wb.addWorksheet(def[f.lang].replace(/[*?:\\/\[\]]/g, '-').slice(0, 31), { views: [{ rightToLeft: f.lang === 'ar', state: 'frozen', ySplit: 3 }] });
  ws.addRow([def[f.lang]]).font = { bold: true, size: 14 };
  ws.addRow([(f.lang === 'ar' ? 'تاريخ الإصدار: ' : 'Generated: ') + new Date().toISOString().slice(0, 16).replace('T', ' ') + (f.from || f.to ? `  ·  ${f.from || ''} → ${f.to || ''}` : '')]).font = { italic: true, color: { argb: 'FF64748B' } };
  const header = ws.addRow(columns.map((c) => c.label)); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2540' } }; c.alignment = { horizontal: 'center' }; });
  for (const r of data) ws.addRow(columns.map((c) => { const v = r[c.key]; if (v === null || v === undefined) return ''; if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v.slice(0, 10)); return v; }));
  columns.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = def.columns[i].width || 14; if (c.type === 'money') col.numFmt = '#,##0.00'; if (c.type === 'date') col.numFmt = 'dd/mm/yyyy'; if (c.type === 'percent') col.numFmt = '0"%"'; });
  // totals row for numeric/money columns
  if (data.length) { const tot = ws.addRow(columns.map((c, i) => { if (i === 0) return f.lang === 'ar' ? 'الإجمالي' : 'Total'; if (c.type === 'money' || c.type === 'number') { const L = ws.getColumn(i + 1).letter; return { formula: `SUM(${L}4:${L}${3 + data.length})` }; } return ''; })); tot.font = { bold: true }; }
  if (summary && Object.keys(summary).length) { const s2 = wb.addWorksheet(f.lang === 'ar' ? 'الملخص' : 'Summary', { views: [{ rightToLeft: f.lang === 'ar' }] }); Object.entries(summary).forEach(([k, v]) => { if (v && typeof v === 'object') { s2.addRow([k]).font = { bold: true }; Object.entries(v).forEach(([kk, vv]) => s2.addRow(['', kk, vv])); } else s2.addRow([k, v]); }); s2.getColumn(1).width = 18; s2.getColumn(2).width = 24; s2.getColumn(3).width = 16; }
  await audit(req, { action: 'report.export', entityType: 'report', after: { key: req.params.key, rows: data.length, filters: f } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.key}-${today()}.xlsx"`);
  await wb.xlsx.write(res); res.end();
}));

export default router;
