import { sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from './config.js';

// Atomic per-company sequence → human-readable codes such as VH-000123
export async function nextCode(companyId, key, prefix, tx = db) {
  const [row] = await tx
    .insert(schema.sequences)
    .values({ companyId, key, value: 1 })
    .onConflictDoUpdate({ target: [schema.sequences.companyId, schema.sequences.key], set: { value: sql`${schema.sequences.value} + 1` } })
    .returning({ value: schema.sequences.value });
  return `${prefix}-${String(row.value).padStart(6, '0')}`;
}

export function parsePagination(query, defaults = { page: 1, pageSize: 20 }) {
  const page = Math.max(1, Number(query.page) || defaults.page);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || defaults.pageSize));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

export function paged(rows, total, { page, pageSize }) {
  return { data: rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export const toISODate = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
};

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + 'T00:00:00Z');
  const b = new Date(toStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// Calendar date in the business timezone (not UTC) – e.g. 01:00 in Cairo is still "today" there while UTC is still yesterday
/** Business date: the calendar date in the company timezone after shifting back `dayStartHour` hours,
 *  so a night shift that runs past midnight still belongs to the day it started (Monday 23:00 → 01:30 = Monday). */
export const businessToday = (dayStartHour = 0, now = new Date()) => {
  const shifted = new Date(now.getTime() - Number(dayStartHour || 0) * 3600 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(shifted);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
export const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export const money = (v) => Number(Number(v || 0).toFixed(2));

// Removes undefined keys so partial updates don't null-out columns
export const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

export const ilike = (col, term) => sql`${col} ILIKE ${'%' + term + '%'}`;
