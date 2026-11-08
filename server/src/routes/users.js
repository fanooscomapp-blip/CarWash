import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, eq, sql, or, getTableColumns, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { wrap, notFound, badRequest, validationFailed } from '../lib/errors.js';
import { requirePermission } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { parsePagination, paged, compact, ilike } from '../lib/util.js';
import { PERMISSIONS, PERMISSION_KEYS } from '../lib/permissions.js';

const router = Router();
const { users, roles, staffCompounds, compounds } = schema;

const userSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().transform((s) => s.toLowerCase()),
  mobile: z.string().max(30).optional().nullable(),
  password: z.string().min(8).optional(),
  roleId: z.string().uuid(),
  userType: z.enum(['admin', 'staff']).optional(),
  employeeCode: z.string().max(40).optional().nullable(),
  isActive: z.boolean().optional(),
  dateJoined: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  compoundIds: z.array(z.string().uuid()).optional(),
});

const safe = ({ passwordHash, ...u }) => u;

// ───── Users (admins + staff) ─────
router.get('/', requirePermission('users.manage', 'staff.view'), wrap(async (req, res) => {
  const { search, userType, isActive, roleId } = req.query;
  const pg = parsePagination(req.query);
  const where = and(eq(users.companyId, req.companyId),
    userType ? eq(users.userType, userType) : undefined,
    roleId ? eq(users.roleId, roleId) : undefined,
    isActive !== undefined && isActive !== '' ? eq(users.isActive, isActive === 'true') : undefined,
    search ? or(ilike(users.name, search), ilike(users.email, search), ilike(users.mobile, search), ilike(users.employeeCode, search)) : undefined);
  const rows = await db.select({ ...getTableColumns(users), roleName: roles.name,
    compoundNames: sql`(SELECT string_agg(c.name, ', ') FROM staff_compounds sc JOIN compounds c ON c.id = sc.compound_id WHERE sc.user_id = ${users.id})`,
    compoundIds: sql`(SELECT coalesce(array_agg(sc.compound_id), '{}') FROM staff_compounds sc WHERE sc.user_id = ${users.id})` })
    .from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(where).orderBy(users.userType, users.name).limit(pg.limit).offset(pg.offset);
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(users).where(where);
  res.json(paged(rows.map(safe), count, pg));
}));

router.post('/', requirePermission('users.manage', 'staff.manage'), wrap(async (req, res) => {
  const body = userSchema.parse(req.body);
  if (!body.password) throw validationFailed('Password is required for a new user');
  const role = await db.query.roles.findFirst({ where: and(eq(roles.id, body.roleId), eq(roles.companyId, req.companyId)) });
  if (!role) throw notFound('Role');
  const userType = body.userType || (role.permissions.some((p) => p.startsWith('tasks.')) && !role.permissions.includes('*') ? 'staff' : 'admin');
  const row = await db.transaction(async (t) => {
    const [u] = await t.insert(users).values({ companyId: req.companyId, name: body.name, email: body.email, mobile: body.mobile || null, roleId: role.id, userType,
      employeeCode: body.employeeCode || null, isActive: body.isActive ?? true, dateJoined: body.dateJoined || null, passwordHash: await bcrypt.hash(body.password, 10) }).returning();
    if (body.compoundIds?.length) await t.insert(staffCompounds).values(body.compoundIds.map((compoundId) => ({ userId: u.id, compoundId })));
    await audit(req, { action: 'user.create', entityType: 'user', entityId: u.id, after: { ...safe(u), compoundIds: body.compoundIds } }, t);
    return u;
  });
  res.status(201).json(safe(row));
}));

router.put('/:id', requirePermission('users.manage', 'staff.manage'), wrap(async (req, res) => {
  const body = userSchema.partial().parse(req.body);
  const before = await db.query.users.findFirst({ where: and(eq(users.id, req.params.id), eq(users.companyId, req.companyId)) });
  if (!before) throw notFound('User');
  if (before.id === req.user.id && body.isActive === false) throw badRequest('You cannot deactivate your own account');
  if (body.roleId) {
    const role = await db.query.roles.findFirst({ where: and(eq(roles.id, body.roleId), eq(roles.companyId, req.companyId)) });
    if (!role) throw notFound('Role');
  }
  const { password, compoundIds, ...rest } = body;
  const patch = compact(rest);
  if (password) patch.passwordHash = await bcrypt.hash(password, 10);
  const row = await db.transaction(async (t) => {
    const [u] = await t.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, before.id)).returning();
    if (compoundIds) {
      await t.delete(staffCompounds).where(eq(staffCompounds.userId, u.id));
      if (compoundIds.length) await t.insert(staffCompounds).values(compoundIds.map((compoundId) => ({ userId: u.id, compoundId })));
    }
    await audit(req, { action: 'user.update', entityType: 'user', entityId: u.id, before: safe(before), after: { ...safe(u), compoundIds, passwordChanged: !!password } }, t);
    return u;
  });
  res.json(safe(row));
}));

// ───── Roles ─────
router.get('/roles', requirePermission('users.manage', 'roles.manage', 'staff.view'), wrap(async (req, res) => {
  const rows = await db.select({ ...getTableColumns(roles), usersCount: sql`(SELECT count(*) FROM users u WHERE u.role_id = ${roles.id})`.mapWith(Number) })
    .from(roles).where(eq(roles.companyId, req.companyId)).orderBy(desc(roles.isSystem), roles.name);
  res.json({ roles: rows, permissions: PERMISSIONS });
}));

const roleSchema = z.object({ name: z.string().min(1).max(100), description: z.string().max(500).optional().nullable(),
  permissions: z.array(z.string()).refine((arr) => arr.every((p) => p === '*' || PERMISSION_KEYS.includes(p)), 'Unknown permission key') });

router.post('/roles', requirePermission('roles.manage'), wrap(async (req, res) => {
  const body = roleSchema.parse(req.body);
  const [row] = await db.insert(roles).values({ ...body, companyId: req.companyId }).returning();
  await audit(req, { action: 'role.create', entityType: 'role', entityId: row.id, after: row });
  res.status(201).json(row);
}));

router.put('/roles/:id', requirePermission('roles.manage'), wrap(async (req, res) => {
  const body = roleSchema.partial().parse(req.body);
  const before = await db.query.roles.findFirst({ where: and(eq(roles.id, req.params.id), eq(roles.companyId, req.companyId)) });
  if (!before) throw notFound('Role');
  if (before.isSystem && before.name === 'Super Admin') throw badRequest('The Super Admin role cannot be modified');
  const [row] = await db.update(roles).set(compact(body)).where(eq(roles.id, before.id)).returning();
  await audit(req, { action: 'role.update', entityType: 'role', entityId: row.id, before, after: row });
  res.json(row);
}));

router.delete('/roles/:id', requirePermission('roles.manage'), wrap(async (req, res) => {
  const before = await db.query.roles.findFirst({ where: and(eq(roles.id, req.params.id), eq(roles.companyId, req.companyId)) });
  if (!before) throw notFound('Role');
  if (before.isSystem) throw badRequest('System roles cannot be deleted');
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(users).where(eq(users.roleId, before.id));
  if (count > 0) throw badRequest(`Role is assigned to ${count} user(s)`);
  await db.delete(roles).where(eq(roles.id, before.id));
  await audit(req, { action: 'role.delete', entityType: 'role', entityId: before.id, before });
  res.json({ ok: true });
}));

export default router;
