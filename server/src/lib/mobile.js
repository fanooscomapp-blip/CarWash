// Canonical mobile format: E.164-ish "+<country><number>". Local Egyptian numbers (01xxxxxxxxx) become +201xxxxxxxxx.
// The default country code comes from DEFAULT_COUNTRY_CODE (e.g. "20" for Egypt, "962" for Jordan).
const CC = (process.env.DEFAULT_COUNTRY_CODE || '20').replace(/^\+/, '');
export function normalizeMobile(input) {
  if (input === null || input === undefined) return input;
  let m = String(input).trim().replace(/[\s\-().]/g, '');
  if (!m) return m;
  if (m.startsWith('00')) m = '+' + m.slice(2);
  if (m.startsWith('+')) return m;
  if (/^0\d{9,10}$/.test(m)) return `+${CC}${m.slice(1)}`;   // local with leading 0
  if (new RegExp(`^${CC}\\d{8,}$`).test(m)) return '+' + m;      // country code without +
  return '+' + m;
}
// Variants to match legacy rows stored in other formats
export function mobileCandidates(m) {
  const c = normalizeMobile(m); const set = new Set([c, c.replace(/^\+/, '')]);
  if (c.startsWith('+' + CC)) set.add('0' + c.slice(CC.length + 1));
  return [...set];
}
