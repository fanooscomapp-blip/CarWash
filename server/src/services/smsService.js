// Centralised SMS: template rendering, provider adapters, delivery log. Nothing is ever "simulated":
// when no provider is configured the message is logged with status not_configured and NOT marked sent.
import { and, eq, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getSetting } from './settingsService.js';
import { normalizeMobile } from '../lib/mobile.js';

const { smsTemplates, smsLogs, companies } = schema;

export function renderTemplate(body, vars) {
  return body.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}

export async function getTemplate(companyId, key, lang) {
  const row = await db.query.smsTemplates.findFirst({ where: and(eq(smsTemplates.companyId, companyId), eq(smsTemplates.key, key), eq(smsTemplates.lang, lang), eq(smsTemplates.isActive, true)) })
    || await db.query.smsTemplates.findFirst({ where: and(eq(smsTemplates.companyId, companyId), eq(smsTemplates.key, key), eq(smsTemplates.isActive, true)) });
  return row;
}

// ───────────── Provider adapters ─────────────
// SMS Misr v2 HTTP API. Response JSON: { code: "1901", SMSID, Cost } – 1901 = success.
const SMSMISR_CODES = {
  1901: 'Success', 1902: 'Invalid request', 1903: 'Invalid username or password', 1904: 'Invalid sender', 1905: 'Invalid mobile number',
  1906: 'Insufficient credit', 1907: 'Server under updating', 1908: 'Invalid date & time format for DelayUntil', 1909: 'Invalid message', 1910: 'Invalid language', 1911: 'Text is too long', 1912: 'Invalid environment',
};
async function sendViaSmsMisr(cfg, { to, body, lang }) {
  const base = (cfg.apiUrl || 'https://smsmisr.com/api/SMS/').replace(/\/?$/, '/');
  const language = lang === 'ar' ? '2' : /[^\x00-\x7F]/.test(body) ? '3' : '1'; // 1 English, 2 Arabic, 3 Unicode
  const params = new URLSearchParams({ environment: cfg.environment === 'test' ? '2' : '1', username: cfg.username, password: cfg.password, sender: cfg.senderId, mobile: to.replace(/^\+/, ''), language, message: body });
  const res = await fetch(`${base}?${params.toString()}`, { method: 'POST', signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  const code = String(json.code ?? json.Code ?? '');
  const ok = code === '1901';
  return { ok, providerId: json.SMSID || json.smsid || null, response: { httpStatus: res.status, ...json, codeMeaning: SMSMISR_CODES[code] || undefined } };
}

// Generic JSON webhook adapter: POST { to, message, sender } with Bearer token – lets any other gateway be wired without code changes.
async function sendViaGeneric(cfg, { to, body }) {
  const res = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify({ to, message: body, sender: cfg.senderId }), signal: AbortSignal.timeout(15000) });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, providerId: json.id || json.messageId || null, response: { httpStatus: res.status, ...json } };
}

export function isConfigured(cfg) {
  if (cfg.provider === 'smsmisr') return !!(cfg.username && cfg.password && cfg.senderId);
  if (cfg.provider === 'generic') return !!(cfg.apiUrl && cfg.apiKey);
  return false;
}

/**
 * Send one SMS. Returns the sms_logs row. `templateKey` + `vars` renders a template; or pass `body` directly.
 */
export async function sendSms(companyId, { to, templateKey, vars = {}, body, lang, ownerId = null }) {
  const cfg = await getSetting(companyId, 'sms');
  const language = lang || cfg.defaultLang || 'ar';
  let text = body;
  if (!text && templateKey) {
    const tpl = await getTemplate(companyId, templateKey, language);
    if (!tpl) throw new Error(`SMS template "${templateKey}" not found`);
    text = renderTemplate(tpl.body, vars);
  }
  const mobile = normalizeMobile(to);
  const [log] = await db.insert(smsLogs).values({ companyId, toMobile: mobile, ownerId, templateKey: templateKey || null, body: text, status: 'queued' }).returning();

  if (!isConfigured(cfg)) {
    const [row] = await db.update(smsLogs).set({ status: 'not_configured', providerResponse: { reason: 'SMS provider not configured in Settings → SMS' } }).where(eq(smsLogs.id, log.id)).returning();
    return row;
  }
  try {
    const result = cfg.provider === 'smsmisr' ? await sendViaSmsMisr(cfg, { to: mobile, body: text, lang: language }) : await sendViaGeneric(cfg, { to: mobile, body: text });
    const [row] = await db.update(smsLogs).set({ status: result.ok ? 'sent' : 'failed', sentAt: result.ok ? new Date() : null, providerResponse: { ...result.response, providerId: result.providerId } }).where(eq(smsLogs.id, log.id)).returning();
    return row;
  } catch (e) {
    const [row] = await db.update(smsLogs).set({ status: 'failed', providerResponse: { error: e.message } }).where(eq(smsLogs.id, log.id)).returning();
    return row;
  }
}

export async function listSmsLogs(companyId, { status, limit = 50, offset = 0, search } = {}) {
  const where = and(eq(smsLogs.companyId, companyId), status ? eq(smsLogs.status, status) : undefined, search ? sql`(${smsLogs.toMobile} ILIKE ${'%' + search + '%'} OR ${smsLogs.body} ILIKE ${'%' + search + '%'})` : undefined);
  return db.select().from(smsLogs).where(where).orderBy(desc(smsLogs.createdAt)).limit(limit).offset(offset);
}

export async function companyName(companyId) {
  const c = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  return c;
}
