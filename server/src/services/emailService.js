// Outgoing email (SMTP via nodemailer). Configured in Settings → Email. Used for admin password resets.
import nodemailer from 'nodemailer';
import { getSetting } from './settingsService.js';

export function emailConfigured(cfg) {
  return !!(cfg && cfg.host && cfg.port && cfg.from);
}

function transporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.host, port: Number(cfg.port), secure: Number(cfg.port) === 465 || cfg.secure === true,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
  });
}

/** Sends one email. Returns { ok, messageId?, error? } — never throws. */
export async function sendEmail(companyId, { to, subject, text, html }) {
  const cfg = await getSetting(companyId, 'email');
  if (!emailConfigured(cfg)) return { ok: false, error: 'EMAIL_NOT_CONFIGURED' };
  try {
    const info = await transporter(cfg).sendMail({ from: cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from, to, subject, text, html });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function verifyEmail(cfg) {
  if (!emailConfigured(cfg)) return { ok: false, error: 'EMAIL_NOT_CONFIGURED' };
  try { await transporter(cfg).verify(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}
