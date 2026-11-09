import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, X, LocateFixed } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useDebounced } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { Spinner } from './ui.jsx';
import BodyIcon from './BodyIcons.jsx';

// Searchable brand picker (free text allowed)
export function BrandPicker({ value, onChange, brands, placeholder }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(value || ''); const box = useRef();
  useEffect(() => setQ(value || ''), [value]);
  useEffect(() => { const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const list = useMemo(() => brands.filter((b) => b.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12), [brands, q]);
  return (
    <div className="relative" ref={box}>
      <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-slate-400 pointer-events-none" />
      <input className="input ps-8" value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }} />
      {open && list.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {list.map((b) => <button type="button" key={b} onClick={() => { onChange(b); setQ(b); setOpen(false); }} className={`block w-full text-start px-3 py-1.5 text-sm hover:bg-slate-50 ${b === value ? 'font-semibold text-brand-600' : ''}`}>{b}</button>)}
        </div>
      )}
    </div>
  );
}

// Unit code: free text + suggestions from the compound
export function UnitInput({ value, onChange, compoundId, ownerId, placeholder }) {
  const [open, setOpen] = useState(false); const [sugg, setSugg] = useState([]); const box = useRef();
  const q = useDebounced(value, 200);
  useEffect(() => { if (!compoundId || !open) return; api.get('/admin/registration/units', { params: { compoundId, q } }).then((r) => setSugg(r.data)).catch(() => setSugg([])); }, [q, compoundId, open]);
  useEffect(() => { const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div className="relative" ref={box}>
      <input className="input uppercase font-semibold" value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { onChange(e.target.value); setOpen(true); }} />
      {open && sugg.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {sugg.map((u) => <button type="button" key={u.id} onClick={() => { onChange(u.unitNumber); setOpen(false); }} className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-slate-50"><span className="font-semibold">{u.unitNumber}</span><span className={`text-xs ${ownerId && u.ownerId !== ownerId ? 'text-orange-600' : 'text-slate-400'}`}>{u.ownerName}</span></button>)}
        </div>
      )}
    </div>
  );
}

export function ColorPicker({ value, onChange, colors, t }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button type="button" key={c.key} title={t(`colors.${c.key}`)} onClick={() => onChange(c.key)}
          className={`relative h-7 w-7 rounded-full border transition-transform hover:scale-110 ${value === c.key ? 'ring-2 ring-offset-2 ring-brand-600 border-transparent' : 'border-slate-300'}`} style={{ background: c.hex }}>
          {value === c.key && <Check size={13} className={`absolute inset-0 m-auto ${['white', 'beige', 'yellow', 'silver'].includes(c.key) ? 'text-slate-800' : 'text-white'}`} />}
        </button>
      ))}
    </div>
  );
}


// GPS capture button / display
export function GpsField({ lat, lng, busy, onCapture, onClear }) {
  const { t } = useI18n();
  if (lat) return (
    <div className="flex items-center gap-1.5">
      <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="input flex-1 text-xs text-brand-600 truncate" dir="ltr">{lat}, {lng}</a>
      <button type="button" className="btn-ghost p-2" onClick={onClear}><X size={14} /></button>
    </div>
  );
  return <button type="button" className="btn-secondary w-full" disabled={busy} onClick={onCapture}>{busy ? <Spinner /> : <LocateFixed size={15} />}{t('register.captureGps')}</button>;
}

export function useGpsCapture(toast, t) {
  return (onResult, setBusy) => {
    if (!navigator.geolocation) return toast.error(t('register.gpsUnsupported'));
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); onResult(+pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6)); },
      () => { setBusy(false); toast.error(t('register.gpsDenied')); }, { enableHighAccuracy: true, timeout: 10000 });
  };
}

const COLOR_HEX = { white: '#f8fafc', black: '#111827', silver: '#c0c7d1', grey: '#6b7280', blue: '#2563eb', navy: '#1e3a8a', red: '#dc2626', maroon: '#7f1d1d', green: '#16a34a', beige: '#d6c7a1', brown: '#78350f', gold: '#ca8a04', orange: '#ea580c', yellow: '#facc15', purple: '#7e22ce' };
export function ColorDot({ color }) {
  if (!color) return null;
  return <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300 shrink-0" style={{ background: COLOR_HEX[color] || 'linear-gradient(135deg,#f87171,#60a5fa,#4ade80)' }} />;
}
// Translates a colour key; legacy free-text colours (e.g. "White" from old records) fall through unchanged
export const colorName = (t, color) => { if (!color) return ''; const k = color.toLowerCase(); const v = t(`colors.${k}`); return v === `colors.${k}` ? color : v; };

export function BodyTypePicker({ value, onChange, types, t }) {
  return (
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
      {types.map((bt) => <button type="button" key={bt} onClick={() => onChange(bt)} title={t(`vehicles.types.${bt}`)} className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 transition-colors ${value === bt ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}><BodyIcon type={bt} className="h-5 w-10" /><span className="text-[10px] font-medium leading-tight text-center">{t(`vehicles.types.${bt}`)}</span></button>)}
    </div>
  );
}
