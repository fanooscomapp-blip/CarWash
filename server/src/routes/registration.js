import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq, sql, getTableColumns } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, validationFailed, conflict } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { nextCode, compact } from '../lib/util.js';
import { BODY_TYPES, VEHICLE_BRANDS, VEHICLE_COLORS } from '../lib/vehicleCatalog.js';
import { normalizeMobile, mobileCandidates } from '../lib/mobile.js';

const router = Router();
const { owners, units, vehicles, compounds, qrCodes } = schema;
const normalizeUnit = (s) => s.trim().toUpperCase().replace(/\s+/g, ' ');
const normalizePlate = (s) => s.trim().toUpperCase().replace(/\s+/g, ' ');

// Reference lists for the form
router.get('/catalog', wrap(async (_req, res) => {
  res.json({ brands: VEHICLE_BRANDS, bodyTypes: BODY_TYPES, colors: VEHICLE_COLORS });
}));

// Step 1 of the single-screen flow: who is this mobile number? Returns the owner with their units + vehicles (any compound).
router.get('/lookup', requirePermission('units.view', 'owners.view'), wrap(async (req, res) => {
  const raw = String(req.query.mobile || '');
  const mobile = normalizeMobile(raw.startsWith(' ') ? '+' + raw.trim() : raw);
  if (mobile.length < 6) throw validationFailed('Mobile number is too short');
  const candidates = mobileCandidates(mobile);
  const owner = await db.query.owners.findFirst({ where: and(eq(owners.companyId, req.companyId), sql`${owners.mobile} IN (${sql.join(candidates.map((c) => sql`${c}`), sql`, `)})`) });
  if (!owner) return res.json({ found: false, mobile });
  const ownerUnits = await db.select({ ...getTableColumns(units), compoundName: compounds.name }).from(units).innerJoin(compounds, eq(compounds.id, units.compoundId)).where(eq(units.ownerId, owner.id)).orderBy(compounds.name, units.unitNumber);
  const ownerVehicles = await db.select({ ...getTableColumns(vehicles), unitNumber: units.unitNumber, compoundName: compounds.name })
    .from(vehicles).innerJoin(units, eq(units.id, vehicles.unitId)).innerJoin(compounds, eq(compounds.id, vehicles.compoundId)).where(eq(vehicles.ownerId, owner.id)).orderBy(vehicles.createdAt);
  res.json({ found: true, owner, units: ownerUnits, vehicles: ownerVehicles });
}));

// Unit-code suggestions inside a compound (for the unit field's autocomplete)
router.get('/units', requirePermission('units.view'), wrap(async (req, res) => {
  const { compoundId, q = '' } = req.query;
  if (!compoundId) return res.json([]);
  const rows = await db.select({ id: units.id, unitNumber: units.unitNumber, ownerId: units.ownerId, ownerName: owners.name, ownerMobile: owners.mobile })
    .from(units).innerJoin(owners, eq(owners.id, units.ownerId))
    .where(and(eq(units.companyId, req.companyId), eq(units.compoundId, compoundId), q ? sql`${units.unitNumber} ILIKE ${q + '%'}` : undefined))
    .orderBy(units.unitNumber).limit(10);
  res.json(rows);
}));

const vehicleRow = z.object({
  unitNumber: z.string().min(1).max(40).transform(normalizeUnit),
  plateNumber: z.string().min(1).max(40).transform(normalizePlate),
  brand: z.string().max(80).optional().nullable(),
  model: z.string().max(80).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  vehicleType: z.enum(BODY_TYPES).default('sedan'),
  parkingLocation: z.string().max(200).optional().nullable(),
  gpsLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  gpsLng: z.coerce.number().min(-180).max(180).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
const registrationSchema = z.object({
  compoundId: z.string().uuid(),
  owner: z.object({
    id: z.string().uuid().optional().nullable(),      // existing owner (from lookup) – name/email updates are ignored unless provided
    name: z.string().min(1).max(200).optional(),
    mobile: z.string().min(6).max(30).transform(normalizeMobile),
    altMobile: z.string().max(30).optional().nullable().transform((s) => (s ? normalizeMobile(s) : s)),
    email: z.string().email().optional().nullable().or(z.literal('')).transform((s) => s || null),
    notes: z.string().max(2000).optional().nullable(),
  }),
  vehicles: z.array(vehicleRow).min(1).max(20),
});

/**
 * Single-screen registration: owner (new or existing) + any units referenced by code (created on the fly) + N vehicles.
 * Everything runs in one transaction – either all records are created or none.
 */
router.post('/', requirePermission('units.manage', 'vehicles.manage'), wrap(async (req, res) => {
  const body = registrationSchema.parse(req.body);
  const compound = await db.query.compounds.findFirst({ where: and(eq(compounds.id, body.compoundId), eq(compounds.companyId, req.companyId)) });
  if (!compound) throw notFound('Compound');
  if (compound.status !== 'active') throw validationFailed('Compound is inactive');

  // Duplicate plates inside the same request
  const plates = body.vehicles.map((v) => v.plateNumber);
  const dupPlate = plates.find((p, i) => plates.indexOf(p) !== i);
  if (dupPlate) throw validationFailed(`Plate ${dupPlate} appears twice in the form`);

  const result = await db.transaction(async (t) => {
    // 1. Owner – find by mobile, else create
    let owner = await t.query.owners.findFirst({ where: and(eq(owners.companyId, req.companyId), sql`${owners.mobile} IN (${sql.join(mobileCandidates(body.owner.mobile).map((c) => sql`${c}`), sql`, `)})`) });
    const createdOwner = !owner;
    if (!owner) {
      if (!body.owner.name) throw validationFailed('Owner name is required for a new customer');
      [owner] = await t.insert(owners).values({ companyId: req.companyId, name: body.owner.name, mobile: body.owner.mobile, altMobile: body.owner.altMobile || null, email: body.owner.email || null, notes: body.owner.notes || null, portalToken: crypto.randomBytes(24).toString('base64url') }).returning();
      await audit(req, { action: 'owner.create', entityType: 'owner', entityId: owner.id, after: owner }, t);
    } else if (body.owner.name || body.owner.altMobile !== undefined || body.owner.email !== undefined) {
      const patch = compact({ name: body.owner.name, altMobile: body.owner.altMobile, email: body.owner.email });
      if (Object.keys(patch).length) { const before = owner; [owner] = await t.update(owners).set({ ...patch, updatedAt: new Date() }).where(eq(owners.id, owner.id)).returning(); await audit(req, { action: 'owner.update', entityType: 'owner', entityId: owner.id, before, after: owner }, t); }
    }

    // 2. Units – by code within the compound; create missing ones for this owner
    const unitCache = new Map();
    const createdUnits = [];
    for (const code of new Set(body.vehicles.map((v) => v.unitNumber))) {
      let unit = await t.query.units.findFirst({ where: and(eq(units.compoundId, compound.id), eq(units.unitNumber, code)) });
      if (unit && unit.ownerId !== owner.id) {
        const other = await t.query.owners.findFirst({ where: eq(owners.id, unit.ownerId) });
        throw conflict(`Unit ${code} is already registered to ${other?.name || 'another owner'} (${other?.mobile || ''}). Edit that unit first if ownership changed.`, { unitId: unit.id });
      }
      if (!unit) {
        [unit] = await t.insert(units).values({ companyId: req.companyId, compoundId: compound.id, ownerId: owner.id, unitNumber: code }).returning();
        await audit(req, { action: 'unit.create', entityType: 'unit', entityId: unit.id, after: unit }, t);
        createdUnits.push(unit);
      }
      unitCache.set(code, unit);
    }

    // 3. Vehicles
    const createdVehicles = [];
    for (const v of body.vehicles) {
      const existing = await t.query.vehicles.findFirst({ where: and(eq(vehicles.companyId, req.companyId), eq(vehicles.plateNumber, v.plateNumber)) });
      if (existing) throw conflict(`Plate ${v.plateNumber} is already registered (${existing.vehicleCode})`, { vehicleId: existing.id });
      const unit = unitCache.get(v.unitNumber);
      const vehicleCode = await nextCode(req.companyId, 'vehicle', 'VH', t);
      const [row] = await t.insert(vehicles).values({
        companyId: req.companyId, vehicleCode, plateNumber: v.plateNumber, compoundId: compound.id, unitId: unit.id, ownerId: owner.id,
        brand: v.brand || null, model: v.model || null, color: v.color || null, vehicleType: v.vehicleType,
        parkingLocation: v.parkingLocation || null, gpsLat: v.gpsLat ?? null, gpsLng: v.gpsLng ?? null, gpsSource: v.gpsLat ? 'admin' : null, notes: v.notes || null,
      }).returning();
      await t.insert(qrCodes).values({ vehicleId: row.id, token: crypto.randomBytes(24).toString('base64url') });
      await audit(req, { action: 'vehicle.create', entityType: 'vehicle', entityId: row.id, after: row }, t);
      createdVehicles.push({ ...row, unitNumber: unit.unitNumber });
    }
    await audit(req, { action: 'registration.complete', entityType: 'owner', entityId: owner.id, after: { createdOwner, units: createdUnits.map((u) => u.unitNumber), vehicles: createdVehicles.map((x) => x.plateNumber) } }, t);
    return { owner, createdOwner, units: createdUnits, vehicles: createdVehicles };
  });
  res.status(201).json(result);
}));

export default router;
