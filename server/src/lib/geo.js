/** Small geo helpers: haversine distance, capacity-aware k-means clustering, nearest-neighbour route ordering. */

export function distanceM(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const centroid = (pts) => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });

/**
 * Split `points` ({lat,lng,...}) into clusters with target sizes `sizes` (array of ints, sum ≥ points.length).
 * Capacity-aware k-means: farthest-point seeding, then points are assigned by "regret" (gap between best and second
 * best centre) to the nearest centre that still has room; centres are recomputed; repeat. Returns array of arrays.
 */
export function clusterWithSizes(points, sizes, iterations = 6) {
  const k = sizes.length;
  if (!points.length) return sizes.map(() => []);
  if (k === 1) return [points.slice()];
  // seeds: first = most central point, then farthest from existing seeds
  const c0 = centroid(points);
  let seeds = [points.reduce((b, p) => (distanceM(p, c0) < distanceM(b, c0) ? p : b), points[0])];
  while (seeds.length < k) seeds.push(points.reduce((best, p) => { const d = Math.min(...seeds.map((s) => distanceM(s, p))); return d > best.d ? { p, d } : best; }, { p: points[0], d: -1 }).p);
  let centres = seeds.map((s) => ({ lat: s.lat, lng: s.lng }));
  let clusters = [];
  for (let it = 0; it < iterations; it++) {
    const room = sizes.slice(); clusters = sizes.map(() => []);
    const scored = points.map((p) => { const ds = centres.map((c) => distanceM(p, c)); const sorted = [...ds].sort((a, b) => a - b); return { p, ds, regret: (sorted[1] ?? sorted[0]) - sorted[0] }; });
    scored.sort((a, b) => b.regret - a.regret); // points that strongly prefer one centre go first
    for (const s of scored) {
      const order = s.ds.map((d, i) => [d, i]).sort((a, b) => a[0] - b[0]);
      const slot = order.find(([, i]) => room[i] > 0) || order[0];
      clusters[slot[1]].push(s.p); room[slot[1]]--;
    }
    const next = clusters.map((cl, i) => (cl.length ? centroid(cl) : centres[i]));
    const moved = next.reduce((m, c, i) => m + distanceM(c, centres[i]), 0);
    centres = next;
    if (moved < 1) break;
  }
  return clusters;
}

/** Order points as a short walking route: start at the point closest to `start` (or the centroid) and always go to the nearest unvisited. */
export function routeOrder(points, start = null) {
  if (points.length < 3) return points.slice();
  const remaining = points.slice(); const out = [];
  let cur = start || centroid(points);
  while (remaining.length) { let bi = 0, bd = Infinity; remaining.forEach((p, i) => { const d = distanceM(cur, p); if (d < bd) { bd = d; bi = i; } }); cur = remaining.splice(bi, 1)[0]; out.push(cur); }
  return out;
}

/** Average distance from each point to its cluster centroid (metres) – a quick quality number for logs/tests. */
export function spread(cluster) { if (cluster.length < 2) return 0; const c = centroid(cluster); return Math.round(cluster.reduce((s, p) => s + distanceM(p, c), 0) / cluster.length); }
