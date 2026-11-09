/**
 * Wash-day patterns. A subscription with N washes/week gets a FIXED set of weekdays, evenly spread over the plan's
 * working days (e.g. Sat–Thu), chosen to balance the compound's load: Sat/Mon/Wed vs Sun/Tue/Thu for 3/week,
 * Sat/Tue · Sun/Wed · Mon/Thu for 2/week. The chosen days are stored in subscriptions.allowed_days, so the daily
 * distribution engine simply schedules the car on its days.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const rows = (r) => r.rows || r;
const WEEK = [6, 0, 1, 2, 3, 4, 5]; // Saturday-first

/** Candidate patterns of `n` days spread as evenly as possible over `working` (array of dow). */
export function candidatePatterns(working, n) {
  const w = WEEK.filter((d) => working.includes(d));
  if (n >= w.length) return [w];
  if (n <= 0) return [];
  const step = w.length / n;
  const set = new Map();
  for (let offset = 0; offset < w.length; offset++) {
    const pat = [];
    for (let k = 0; k < n; k++) pat.push(w[Math.round(offset + k * step) % w.length]);
    const uniq = [...new Set(pat)]; if (uniq.length !== n) continue;
    const sorted = WEEK.filter((d) => uniq.includes(d));
    set.set(sorted.join(','), sorted);
  }
  return [...set.values()];
}

/** Active-vehicle load per weekday in a compound: how many paid, non-expired subscriptions × vehicles wash on each dow. */
export async function dayLoads(companyId, compoundId, excludeSubscriptionId = null) {
  const r = rows(await db.execute(sql`
    SELECT d.dow, count(sv.vehicle_id)::int AS vehicles
    FROM generate_series(0,6) AS d(dow)
    LEFT JOIN subscriptions s ON s.company_id = ${companyId} AND s.compound_id = ${compoundId} AND s.payment_status = 'paid'
      AND s.status IN ('active','expiring_soon') AND s.allowed_days @> to_jsonb(ARRAY[d.dow]) ${excludeSubscriptionId ? sql`AND s.id <> ${excludeSubscriptionId}` : sql``}
    LEFT JOIN subscription_vehicles sv ON sv.subscription_id = s.id
    GROUP BY d.dow ORDER BY d.dow`));
  const loads = {}; r.forEach((x) => { loads[x.dow] = x.vehicles; }); return loads;
}

/**
 * Suggest the pattern for a new subscription.
 * Prefers (1) the pattern the owner's other active cars in the compound already have (one visit per unit),
 * then (2) the pattern whose busiest day is least loaded (ties → lowest total load).
 */
export async function suggestWashDays(companyId, { compoundId, workingDays, perWeek, ownerId = null, excludeSubscriptionId = null }) {
  const patterns = candidatePatterns(workingDays, perWeek);
  const loads = await dayLoads(companyId, compoundId, excludeSubscriptionId);
  const score = (p) => [Math.max(...p.map((d) => loads[d] || 0)), p.reduce((a, d) => a + (loads[d] || 0), 0)];
  const ranked = patterns.map((p) => ({ days: p, maxLoad: score(p)[0], totalLoad: score(p)[1] })).sort((a, b) => a.maxLoad - b.maxLoad || a.totalLoad - b.totalLoad);
  let reason = 'balance';
  if (ownerId && ranked.length > 1) {
    const own = rows(await db.execute(sql`SELECT allowed_days FROM subscriptions WHERE company_id = ${companyId} AND compound_id = ${compoundId} AND owner_id = ${ownerId} AND payment_status = 'paid' AND status IN ('active','expiring_soon') ${excludeSubscriptionId ? sql`AND id <> ${excludeSubscriptionId}` : sql``} ORDER BY created_at DESC LIMIT 1`));
    if (own[0]) { const key = WEEK.filter((d) => own[0].allowed_days.includes(d)).join(','); const same = ranked.find((p) => p.days.join(',') === key); if (same) { ranked.splice(ranked.indexOf(same), 1); ranked.unshift(same); reason = 'same_owner'; } }
  }
  const avg = Object.values(loads).reduce((a, b) => a + b, 0) / Math.max(1, WEEK.filter((d) => workingDays.includes(d)).length);
  return { suggested: ranked[0]?.days || WEEK.filter((d) => workingDays.includes(d)), alternatives: ranked, loads, average: Math.round(avg * 10) / 10, reason };
}

/** Days considered "busy": above average load by more than 20% (used for the warning when an admin picks days manually). */
export function busyDays(loads, workingDays) {
  const w = workingDays.filter((d) => loads[d] !== undefined); const avg = w.reduce((a, d) => a + loads[d], 0) / Math.max(1, w.length);
  return w.filter((d) => loads[d] > avg * 1.2 && loads[d] - avg >= 2);
}
