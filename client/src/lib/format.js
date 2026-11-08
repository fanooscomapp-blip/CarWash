export function fmtDate(value, lang = 'en', opts) {
  if (!value) return '—';
  const d = typeof value === 'string' && value.length === 10 ? new Date(value + 'T00:00:00') : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', opts || { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}
export function fmtDateTime(value, lang = 'en') {
  return fmtDate(value, lang, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtMoney(value, currency = 'EGP', lang = 'en') {
  const n = Number(value || 0);
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n);
}
export const fmtNum = (n, lang = 'en') => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US').format(Number(n || 0));
// Local calendar date (never via toISOString, which converts to UTC and shifts the day in UTC+ zones)
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const monthLabel = (ym, lang = 'en') => fmtDate(ym + '-01', lang, { month: 'short', year: '2-digit' });
