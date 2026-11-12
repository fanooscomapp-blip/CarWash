import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { db, schema } from '../db/index.js';
import { wrap, unauthorized, validationFailed } from '../lib/errors.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { sendSms } from '../services/smsService.js';
import { normalizeMobile } from '../lib/mobile.js';
import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';
import crypto from 'node:crypto';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later' } } });

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1), remember: z.boolean().optional().default(false) });

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password, remember } = loginSchema.parse(req.body);
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()), with: { role: true, staffCompounds: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Invalid email or password');
  if (!user.isActive) throw unauthorized('Account is inactive');
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, user.companyId) });
  req.companyId = user.companyId; req.user = { id: user.id };
  await audit(req, { action: 'auth.login', entityType: 'user', entityId: user.id });
  res.json({
    token: remember ? jwt.sign({ sub: user.id, cid: user.companyId, type: user.userType }, config.jwtSecret, { expiresIn: '30d' }) : signToken(user),
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

// ---- Forgot password: 6-digit code by SMS to the user's registered mobile, then reset -------------------------
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } } });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } } });
const maskMobile = (m) => String(m).replace(/^(\+?\d{0,4})\d+(\d{3})$/, (_, a, b) => `${a}${'*'.repeat(Math.max(3, String(m).length - a.length - 3))}${b}`);
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

router.post('/forgot', forgotLimiter, wrap(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  if (!user || !user.isActive) return res.json({ sent: false }); // no account enumeration beyond "nothing was sent"
  if (!user.mobile) return res.json({ sent: false, reason: 'NO_MOBILE' });
  const code = String(crypto.randomInt(100000, 999999));
  await db.insert(schema.passwordResets).values({ userId: user.id, codeHash: hashCode(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  const log = await sendSms(user.companyId, { to: normalizeMobile(user.mobile), templateKey: 'otp', vars: { Code: code, Minutes: 10 } });
  req.companyId = user.companyId; req.user = { id: user.id };
  await audit(req, { action: 'auth.forgot_password', entityType: 'user', entityId: user.id, after: { smsStatus: log?.status } });
  if (log?.status === 'failed') return res.json({ sent: false, reason: 'SMS_FAILED' });
  res.json({ sent: true, maskedMobile: maskMobile(user.mobile), minutes: 10 });
}));

router.post('/reset', resetLimiter, wrap(async (req, res) => {
  const { email, code, newPassword } = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(8) }).parse(req.body);
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  const bad = () => validationFailed('Invalid or expired code');
  if (!user) throw bad();
  const rows = await db.select().from(schema.passwordResets).where(eq(schema.passwordResets.userId, user.id)).orderBy(desc(schema.passwordResets.createdAt)).limit(1);
  const pr = rows[0];
  if (!pr || pr.usedAt || pr.expiresAt < new Date() || pr.attempts >= 5) throw bad();
  if (pr.codeHash !== hashCode(code)) { await db.update(schema.passwordResets).set({ attempts: pr.attempts + 1 }).where(eq(schema.passwordResets.id, pr.id)); throw bad(); }
  await db.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.id, pr.id));
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(newPassword, 10), updatedAt: new Date() }).where(eq(schema.users.id, user.id));
  req.companyId = user.companyId; req.user = { id: user.id };
  await audit(req, { action: 'auth.reset_password', entityType: 'user', entityId: user.id });
  res.json({ ok: true });
}));

router.post('/logout', authenticate, wrap(async (req, res) => {
  await audit(req, { action: 'auth.logout', entityType: 'user', entityId: req.user.id });
  res.json({ ok: true });
}));

export default router;
