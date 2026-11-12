import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { db, schema } from '../db/index.js';
import { wrap, unauthorized, validationFailed } from '../lib/errors.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { sendEmail, emailConfigured } from '../services/emailService.js';
import { getSetting } from '../services/settingsService.js';
import { portalBaseUrl } from '../services/renewalLinkService.js';
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

// ---- Forgot password: emailed reset link (SMTP from Settings → Email), valid 30 minutes, single use ----------------
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } } });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } } });
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const maskEmail = (e) => e.replace(/^(.{1,2})[^@]*(@.*)$/, (_, a, b) => `${a}***${b}`);

router.post('/forgot', forgotLimiter, wrap(async (req, res) => {
  const { email, lang } = z.object({ email: z.string().email(), lang: z.enum(['ar', 'en']).optional().default('ar') }).parse(req.body);
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  if (!user || !user.isActive) return res.json({ sent: false }); // nothing to send; message stays generic
  const emailCfg = await getSetting(user.companyId, 'email');
  if (!emailConfigured(emailCfg)) return res.json({ sent: false, reason: 'EMAIL_NOT_CONFIGURED' });
  const token = crypto.randomBytes(32).toString('base64url');
  await db.insert(schema.passwordResets).values({ userId: user.id, codeHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  const link = `${await portalBaseUrl(user.companyId)}/reset-password/${token}`;
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, user.companyId) });
  const brand = (lang === 'ar' && company?.nameAr) || company?.name || 'Car Wash Management';
  const subject = lang === 'ar' ? `${brand} — إعادة تعيين كلمة المرور` : `${brand} — Password reset`;
  const text = lang === 'ar'
    ? `مرحباً ${user.name}،\n\nوصلنا طلب لإعادة تعيين كلمة مرور حسابك. افتح الرابط التالي خلال 30 دقيقة:\n${link}\n\nإذا لم تطلب ذلك تجاهل هذه الرسالة؛ كلمة مرورك لن تتغير.`
    : `Hello ${user.name},\n\nWe received a request to reset your password. Open this link within 30 minutes:\n${link}\n\nIf you did not request this, ignore this email; your password will not change.`;
  const html = `<div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;line-height:1.7">
    <p>${lang === 'ar' ? `مرحباً ${user.name}،` : `Hello ${user.name},`}</p>
    <p>${lang === 'ar' ? 'وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الزر التالي خلال 30 دقيقة:' : 'We received a request to reset your password. Click the button below within 30 minutes:'}</p>
    <p style="margin:24px 0"><a href="${link}" style="background:#0f2443;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block">${lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset password'}</a></p>
    <p style="font-size:13px;color:#64748b">${lang === 'ar' ? 'أو انسخ الرابط:' : 'Or copy this link:'}<br><a href="${link}" style="color:#2563eb;word-break:break-all">${link}</a></p>
    <p style="font-size:13px;color:#64748b">${lang === 'ar' ? 'إذا لم تطلب ذلك تجاهل هذه الرسالة؛ كلمة مرورك لن تتغير.' : 'If you did not request this, ignore this email; your password will not change.'}</p>
    <p style="font-size:13px;color:#64748b">${brand}</p></div>`;
  const r = await sendEmail(user.companyId, { to: user.email, subject, text, html });
  req.companyId = user.companyId; req.user = { id: user.id };
  await audit(req, { action: 'auth.forgot_password', entityType: 'user', entityId: user.id, after: { emailOk: r.ok, error: r.error } });
  if (!r.ok) return res.json({ sent: false, reason: 'EMAIL_FAILED', error: r.error });
  res.json({ sent: true, maskedEmail: maskEmail(user.email), minutes: 30 });
}));

async function findReset(token) {
  if (!token || token.length < 20) return null;
  const rows = await db.select().from(schema.passwordResets).where(eq(schema.passwordResets.codeHash, hashToken(token))).limit(1);
  const pr = rows[0];
  if (!pr || pr.usedAt || pr.expiresAt < new Date()) return null;
  return pr;
}

// Lets the reset page tell the user up front whether the link is still good
router.get('/reset/:token', resetLimiter, wrap(async (req, res) => {
  const pr = await findReset(req.params.token);
  if (!pr) return res.json({ valid: false });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, pr.userId) });
  res.json({ valid: !!user, email: user ? maskEmail(user.email) : null });
}));

router.post('/reset', resetLimiter, wrap(async (req, res) => {
  const { token, newPassword } = z.object({ token: z.string().min(20).max(200), newPassword: z.string().min(8) }).parse(req.body);
  const pr = await findReset(token);
  if (!pr) throw validationFailed('This reset link is invalid or has expired');
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, pr.userId), with: { role: true, staffCompounds: true } });
  if (!user || !user.isActive) throw validationFailed('This reset link is invalid or has expired');
  await db.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.id, pr.id));
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(newPassword, 10), updatedAt: new Date(), lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  req.companyId = user.companyId; req.user = { id: user.id };
  await audit(req, { action: 'auth.reset_password', entityType: 'user', entityId: user.id });
  const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, user.companyId) });
  res.json({
    ok: true, token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, userType: user.userType, role: user.role.name, permissions: user.role.permissions, compoundIds: user.staffCompounds.map((s) => s.compoundId) },
    company: { id: company.id, name: company.name, nameAr: company.nameAr, currency: company.currency, language: company.language, timezone: company.timezone, dateFormat: company.dateFormat },
  });
}));

router.post('/logout', authenticate, wrap(async (req, res) => {
  await audit(req, { action: 'auth.logout', entityType: 'user', entityId: req.user.id });
  res.json({ ok: true });
}));

export default router;
