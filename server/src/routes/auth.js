import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { db, schema } from '../db/index.js';
import { wrap, unauthorized, validationFailed } from '../lib/errors.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later' } } });

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()), with: { role: true, staffCompounds: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Invalid email or password');
  if (!user.isActive) throw unauthorized('Account is inactive');
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, user.companyId) });
  req.companyId = user.companyId; req.user = { id: user.id };
  await audit(req, { action: 'auth.login', entityType: 'user', entityId: user.id });
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, userType: user.userType, role: user.role.name, permissions: user.role.permissions, compoundIds: user.staffCompounds.map((s) => s.compoundId) },
    company: { id: company.id, name: company.name, nameAr: company.nameAr, currency: company.currency, language: company.language, timezone: company.timezone, dateFormat: company.dateFormat },
  });
}));

router.get('/me', authenticate, wrap(async (req, res) => {
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, req.companyId) });
  res.json({ user: { ...req.user, role: req.user.roleName }, company });
}));

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
router.post('/change-password', authenticate, wrap(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user.id) });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw validationFailed('Current password is incorrect');
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(newPassword, 10), updatedAt: new Date() }).where(eq(schema.users.id, user.id));
  await audit(req, { action: 'auth.change_password', entityType: 'user', entityId: user.id });
  res.json({ ok: true });
}));

router.post('/logout', authenticate, wrap(async (req, res) => {
  await audit(req, { action: 'auth.logout', entityType: 'user', entityId: req.user.id });
  res.json({ ok: true });
}));

export default router;
