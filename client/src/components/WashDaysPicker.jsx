import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

const WEEK = [6, 0, 1, 2, 3, 4, 5];

/**
 * Fixed weekly wash-day pattern for a subscription. Loads the load-balanced suggestion from the server, shows the
 * compound's current load per day, lets the admin pick an alternative pattern or toggle single days (exception),
 * and warns when a chosen day is busy.
 * props: compoundId, planId, perWeek?, unitId?/ownerId?, excludeSubscriptionId?, value (array|null), onChange(days, meta)
 */
export default function WashDaysPicker({ compoundId, planId, perWeek, unitId, ownerId, excludeSubscriptionId, value, onChange, compact = false }) {
  const { t } = useI18n(); const days = t('common.weekdays');
  const [sug, setSug] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => {
    if (!compoundId || !planId) return;
    let alive = true; setSug(null);
    api.get('/admin/subscriptions/suggest-days', { params: { compoundId, planId, perWeek: perWeek || undefined, unitId, ownerId, excludeSubscriptionId } })
      .then((r) => { if (!alive) return; setSug(r.data); if (!value) onChange(r.data.suggested, { auto: true }); })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [compoundId, planId, perWeek, unitId, ownerId, excludeSubscriptionId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <p className="text-xs text-red-600">{err}</p>;
  if (!sug) return <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />;
  const sel = value || sug.suggested;
  const working = sug.workingDays;
  const maxLoad = Math.max(1, ...Object.values(sug.loads));
  const isSuggested = sel.join(',') === sug.suggested.join(',');
  const busyPicked = sel.filter((d) => sug.busy.includes(d));
  const toggle = (d) => { if (!working.includes(d)) return; const n = sel.includes(d) ? sel.filter((x) => x !== d) : [...sel, d]; if (n.length) onChange(WEEK.filter((x) => n.includes(x)), { auto: false }); };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1">
        {WEEK.map((d) => { const on = sel.includes(d), off = !working.includes(d), load = sug.loads[d] || 0; return (
          <button type="button" key={d} disabled={off} onClick={() => toggle(d)} title={off ? t('washDays.offDay') : `${load} ${t('washDays.carsOnDay')}`}
            className={`rounded-lg border px-1 py-1.5 text-center transition ${off ? 'border-dashed border-slate-200 text-slate-300 bg-slate-50' : on ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-navy-900'}`}>
            <div className="text-xs font-semibold">{days[d]}</div>
            {!off && <div className="mt-1 h-1.5 rounded-full bg-black/10 overflow-hidden"><div className={`h-full ${sug.busy.includes(d) ? 'bg-orange-400' : on ? 'bg-emerald-400' : 'bg-slate-400'}`} style={{ width: `${Math.round((load / maxLoad) * 100)}%` }} /></div>}
            {!off && <div className={`text-[10px] mt-0.5 ${on ? 'text-white/80' : 'text-slate-400'}`}>{load}</div>}
          </button>); })}
      </div>
      {!compact && sug.fixedPattern && sug.alternatives.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 inline-flex items-center gap-1"><Sparkles size={12} />{t('washDays.patterns')}:</span>
          {sug.alternatives.map((a) => { const key = a.days.join(','); const on = key === sel.join(','); return <button type="button" key={key} onClick={() => onChange(a.days, { auto: key === sug.suggested.join(',') })} className={`rounded-full border px-2 py-0.5 ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{a.days.map((d) => days[d].slice(0, 3)).join(' · ')} <span className="opacity-70">({a.maxLoad})</span></button>; })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {isSuggested ? <span className="text-emerald-700 inline-flex items-center gap-1"><Sparkles size={12} />{sug.reason === 'same_owner' ? t('washDays.sameOwner') : t('washDays.balanced')}</span> : <span className="text-slate-500">{t('washDays.manual')}</span>}
        {sel.length !== sug.perWeek && sug.fixedPattern && <span className="text-orange-700 inline-flex items-center gap-1"><AlertTriangle size={12} />{t('washDays.countMismatch', { n: sug.perWeek, m: sel.length })}</span>}
        {busyPicked.length > 0 && <span className="text-orange-700 inline-flex items-center gap-1"><AlertTriangle size={12} />{t('washDays.busy', { d: busyPicked.map((d) => days[d]).join('، ') })}</span>}
        <span className="text-slate-400 inline-flex items-center gap-1 ms-auto"><Users size={12} />{t('washDays.avg', { n: sug.average })}</span>
      </div>
    </div>
  );
}
