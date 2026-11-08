import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../lib/config.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { hasPermission } from '../lib/permissions.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, cid: user.companyId, type: user.userType }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Verifies JWT, loads user + role permissions, attaches req.user and req.companyId
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch { throw unauthorized('Session expired or invalid'); }
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, payload.sub),
      with: { role: true, staffCompounds: true },
    });
    if (!user || !user.isActive) throw unauthorized('Account is inactive');
    req.user = {
      id: user.id, companyId: user.companyId, name: user.name, email: user.email, userType: user.userType,
      roleId: user.roleId, roleName: user.role.name, permissions: user.role.permissions || [],
      compoundIds: user.staffCompounds.map((s) => s.compoundId),
    };
    req.companyId = user.companyId;
    next();
  } catch (e) { next(e); }
}

export const requirePermission = (...keys) => (req, _res, next) => {
  if (keys.some((k) => hasPermission(req.user, k))) return next();
  next(forbidden());
};

export const requireAdminPortal = (req, _res, next) => {
  if (req.user?.userType !== 'admin') return next(forbidden('Admin portal access only'));
  next();
};
