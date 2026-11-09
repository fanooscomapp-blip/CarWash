// Visual building blocks shared by the admin board and the staff app: Egyptian-style plate, coloured car silhouette, brand badge.
import BodyIcon from './BodyIcons.jsx';

export const COLOR_HEX = { white: '#f8fafc', black: '#111827', silver: '#c0c7d1', grey: '#6b7280', blue: '#2563eb', navy: '#1e3a8a', red: '#dc2626', maroon: '#7f1d1d', green: '#16a34a', beige: '#d6c7a1', brown: '#78350f', gold: '#ca8a04', orange: '#ea580c', yellow: '#facc15', purple: '#7e22ce' };
const LIGHT = new Set(['white', 'silver', 'beige', 'yellow', 'gold']);
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toArabicDigits = (s) => s.replace(/\d/g, (d) => AR_DIGITS[d]);

/** Split "ABC 1234" / "أ ب ج 1234" / "1234 أبج" into { letters, digits } regardless of order. */
export function splitPlate(plate = '') {
  const digits = (plate.match(/[0-9٠-٩]+/g) || []).join('');
  const letters = plate.replace(/[0-9٠-٩]/g, '').replace(/[\s\-_.]+/g, ' ').trim();
  return { letters: letters.split('').filter((c) => c !== ' ').join(' '), digits };
}

/** Egyptian private-car plate look: light-blue header band with مصر / EGYPT, digits (Arabic-Indic) on the left, letters on the right. */
export function PlateEG({ plate, size = 'md', className = '' }) {
  const { letters, digits } = splitPlate(plate);
  const sz = { sm: { w: 'w-28', band: 'text-[7px] h-3', main: 'text-sm h-7' }, md: { w: 'w-40', band: 'text-[9px] h-4', main: 'text-xl h-10' }, lg: { w: 'w-56', band: 'text-[11px] h-5', main: 'text-3xl h-14' } }[size];
  return (
    <div dir="ltr" className={`${sz.w} ${className} inline-flex flex-col overflow-hidden rounded-md border-2 border-slate-800 bg-white shadow-sm select-none shrink-0`} title={plate}>
      <div className={`${sz.band} flex items-center justify-between bg-sky-300 px-1.5 font-bold text-slate-900 leading-none`}><span>EGYPT</span><span>مصر</span></div>
      <div className={`${sz.main} flex items-center justify-between px-2 font-bold tracking-wider text-slate-900 leading-none`}>
        <span className="font-mono">{toArabicDigits(digits) || '—'}</span>
        <span className="font-semibold">{letters || '—'}</span>
      </div>
    </div>
  );
}

/** Car silhouette tinted with the vehicle colour, on a soft background so white cars remain visible. */
export function ColoredCar({ type, color, className = 'h-10 w-20' }) {
  const hex = COLOR_HEX[(color || '').toLowerCase()] || '#94a3b8';
  const light = LIGHT.has((color || '').toLowerCase());
  return (
    <span className={`inline-flex items-center justify-center rounded-lg ${light ? 'bg-slate-700' : 'bg-slate-100'} px-1`} style={{ color: hex }}>
      <BodyIcon type={type || 'sedan'} className={className} />
    </span>
  );
}

/** Deterministic colour per brand name (brand logos are trademarks – a coloured name badge is used instead). */
export function brandHue(name = '') { let h = 0; for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
export function BrandBadge({ brand, model, className = '' }) {
  if (!brand) return null;
  const h = brandHue(brand);
  return (
    <span dir="ltr" className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${className}`} style={{ background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 60% 30%)`, border: `1px solid hsl(${h} 50% 75%)` }}>
      {brand}{model ? <span className="font-medium normal-case opacity-80">· {model}</span> : null}
    </span>
  );
}

export const mapsLink = (lat, lng) => (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);
