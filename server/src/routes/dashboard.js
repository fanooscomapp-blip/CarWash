import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wrap } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { refreshStatuses } from '../services/subscriptionService.js';

const router = Router();
const rows = (r) => r.rows || r;

router.get('/', requirePermission('dashboard.view'), wrap(async (req, res) => {
  await refreshStatuses(req.companyId);
  const cid = req.companyId;
  const { compoundId, dateFrom, dateTo } = req.query;
  const cf = compoundId ? sql`AND compound_id = ${compoundId}` : sql``;
  const from = dateFrom || null; const to = dateTo || null;
  const range = (col) => sql`${from ? sql`AND ${sql.raw(col)} >= ${from}::date` : sql``} ${to ? sql`AND ${sql.raw(col)} < (${to}::date + 1)` : sql``}`;

  const [kpis] = rows(await db.execute(sql`SELECT
    (SELECT count(*) FROM compounds WHERE company_id=${cid} ${compoundId ? sql`AND id = ${compoundId}` : sql``})::int AS compounds,
    (SELECT count(*) FROM units WHERE company_id=${cid} ${cf})::int AS units,
    (SELECT count(*) FROM vehicles WHERE company_id=${cid} ${cf})::int AS vehicles,
    (SELECT count(*) FROM subscriptions WHERE company_id=${cid} AND status IN ('active','expiring_soon') ${cf})::int AS active_subscriptions,
    (SELECT count(*) FROM subscriptions WHERE company_id=${cid} AND status='expiring_soon' ${cf})::int AS expiring_subscriptions,
    (SELECT count(*) FROM subscriptions WHERE company_id=${cid} AND status='expired' ${cf})::int AS expired_subscriptions,
    (SELECT count(*) FROM subscriptions WHERE company_id=${cid} AND status='pending_payment' ${cf})::int AS pending_payment_subscriptions,
    (SELECT count(*) FROM subscription_renewals r JOIN subscriptions s ON s.id = r.new_subscription_id WHERE r.company_id=${cid} AND r.status='pending' ${compoundId ? sql`AND s.compound_id = ${compoundId}` : sql``})::int AS pending_renewals,
    (SELECT count(*) FROM payments WHERE company_id=${cid} AND status='pending_verification' ${cf})::int AS pending_payments,
    (SELECT count(*) FROM registration_requests WHERE company_id=${cid} AND status='pending' ${cf})::int AS pending_registrations,
    (SELECT count(*) FROM washing_tasks WHERE company_id=${cid} AND scheduled_date=CURRENT_DATE ${cf})::int AS washes_today,
    (SELECT count(*) FROM washing_tasks WHERE company_id=${cid} AND scheduled_date=CURRENT_DATE AND status='completed' ${cf})::int AS washes_completed_today,
    (SELECT count(*) FROM washing_tasks WHERE company_id=${cid} AND status IN ('assigned','accepted','in_progress') ${cf})::int AS pending_wash_tasks,
    (SELECT coalesce(sum(amount),0) FROM payments WHERE company_id=${cid} AND status='approved' ${cf} ${range('created_at')})::numeric AS total_revenue,
    (SELECT coalesce(sum(amount),0) FROM payments WHERE company_id=${cid} AND status IN ('pending_verification','awaiting_new_receipt') ${cf})::numeric AS outstanding
  `));

  const statusBreakdown = rows(await db.execute(sql`SELECT status, count(*)::int AS count FROM subscriptions WHERE company_id=${cid} ${cf} GROUP BY status`));
  const monthly = rows(await db.execute(sql`
    WITH months AS (SELECT to_char(d, 'YYYY-MM') AS month FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') d)
    SELECT m.month,
      (SELECT count(*) FROM subscriptions s WHERE s.company_id=${cid} AND s.renewed_from_id IS NULL AND to_char(s.created_at,'YYYY-MM')=m.month ${compoundId ? sql`AND s.compound_id = ${compoundId}` : sql``})::int AS new_subscriptions,
      (SELECT count(*) FROM subscriptions s WHERE s.company_id=${cid} AND s.renewed_from_id IS NOT NULL AND to_char(s.created_at,'YYYY-MM')=m.month ${compoundId ? sql`AND s.compound_id = ${compoundId}` : sql``})::int AS renewals,
      (SELECT coalesce(sum(amount),0) FROM payments p WHERE p.company_id=${cid} AND p.status='approved' AND to_char(coalesce(p.payment_date, p.created_at::date),'YYYY-MM')=m.month ${compoundId ? sql`AND p.compound_id = ${compoundId}` : sql``})::numeric AS revenue,
      (SELECT count(*) FROM washing_operations o WHERE o.company_id=${cid} AND o.status IN ('completed','approved') AND to_char(o.end_time,'YYYY-MM')=m.month)::int AS washes
    FROM months m ORDER BY m.month`));
  const revenueByCompound = rows(await db.execute(sql`SELECT c.id, c.name, coalesce(sum(p.amount),0)::numeric AS revenue, count(p.id)::int AS payments
    FROM compounds c LEFT JOIN payments p ON p.compound_id=c.id AND p.status='approved' ${range('p.created_at')} WHERE c.company_id=${cid} ${compoundId ? sql`AND c.id = ${compoundId}` : sql``} GROUP BY c.id ORDER BY revenue DESC`));
  const revenueByPlan = rows(await db.execute(sql`SELECT s.plan_snapshot->>'name' AS plan, s.plan_snapshot->>'planType' AS plan_type, coalesce(sum(p.amount),0)::numeric AS revenue, count(DISTINCT s.id)::int AS subscriptions
    FROM subscriptions s LEFT JOIN payments p ON p.subscription_id=s.id AND p.status='approved' ${range('p.created_at')} WHERE s.company_id=${cid} ${compoundId ? sql`AND s.compound_id = ${compoundId}` : sql``} GROUP BY 1,2 ORDER BY subscriptions DESC`));
  // Renewal conversion: of subscriptions that ended in the last 90 days, how many were renewed
  const [conversion] = rows(await db.execute(sql`SELECT count(*)::int AS ended,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.renewed_from_id=s.id AND s2.status <> 'cancelled'))::int AS renewed
    FROM subscriptions s WHERE s.company_id=${cid} AND s.end_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE AND s.status <> 'cancelled' ${compoundId ? sql`AND s.compound_id = ${compoundId}` : sql``}`));
  const operations = rows(await db.execute(sql`SELECT status, count(*)::int AS count FROM washing_tasks WHERE company_id=${cid} AND scheduled_date >= CURRENT_DATE - 30 ${cf} GROUP BY status`));
  const staffPerformance = rows(await db.execute(sql`SELECT u.id, u.name, count(t.id)::int AS assigned, count(t.id) FILTER (WHERE t.status='completed')::int AS completed,
      round(avg(EXTRACT(EPOCH FROM (o.end_time - o.start_time))/60) FILTER (WHERE o.end_time IS NOT NULL))::int AS avg_minutes
    FROM users u LEFT JOIN washing_tasks t ON t.assigned_to=u.id LEFT JOIN washing_operations o ON o.task_id=t.id
    WHERE u.company_id=${cid} AND u.user_type='staff' GROUP BY u.id ORDER BY completed DESC LIMIT 10`));
  const latest = rows(await db.execute(sql`SELECT s.id, s.subscription_code, s.status, s.final_amount, s.created_at, s.renewed_from_id, s.plan_snapshot->>'name' AS plan_name, o.name AS owner_name, c.name AS compound_name,
      (SELECT string_agg(v.plate_number, ', ') FROM subscription_vehicles sv JOIN vehicles v ON v.id = sv.vehicle_id WHERE sv.subscription_id = s.id) AS plates
    FROM subscriptions s JOIN owners o ON o.id = s.owner_id JOIN compounds c ON c.id = s.compound_id WHERE s.company_id=${cid} ${compoundId ? sql`AND s.compound_id = ${compoundId}` : sql``} ORDER BY s.created_at DESC LIMIT 8`));
  const recent = rows(await db.execute(sql`SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.company_id=${cid} ORDER BY a.created_at DESC LIMIT 10`));

  res.json({ kpis, statusBreakdown, monthly, revenueByCompound, revenueByPlan, latest, conversion: { ...conversion, rate: conversion.ended ? Math.round((conversion.renewed / conversion.ended) * 100) : null }, operations, staffPerformance, recent });
}));

export default router;
