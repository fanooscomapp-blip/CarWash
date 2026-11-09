import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Camera } from 'lucide-react';
import { papi, usePortal, fmtDate, fmtTime, AuthImg } from './portalLib.jsx';
import { Card, Spinner, Center } from './PortalLayout.jsx';

const TONE = { completed: 'bg-emerald-500', approved: 'bg-emerald-500', in_progress: 'bg-blue-500', accepted: 'bg-blue-400', assigned: 'bg-blue-400', issue_reported: 'bg-red-500', cancelled: 'bg-slate-300', missed: 'bg-slate-300' };
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function WashesPage() {
  const { t, lang, isRtl } = usePortal();
  const [month, setMonth] = useState(() => ym(new Date()));
  const [vehicleId, setVehicleId] = useState('');
  const [me, setMe] = useState(null); const [data, setData] = useState(null); const [sel, setSel] = useState(null); const [detail, setDetail] = useState(null); const [zoom, setZoom] = useState(null);
  useEffect(() => { papi.get('/me').then((r) => setMe(r.data)).catch(() => {}); }, []);
  useEffect(() => { setData(null); papi.get('/washes', { params: { month, vehicleId: vehicleId || undefined } }).then((r) => setData(r.data)).catch(() => setData({ items: [] })); }, [month, vehicleId]);
  useEffect(() => { if (!sel?.operation_id) return setDetail(null); setDetail(null); papi.get(`/washes/${sel.operation_id}`).then((r) => setDetail(r.data)).catch(() => {}); }, [sel]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1); const daysInMonth = new Date(y, m, 0).getDate();
  const startOffset = (first.getDay() + 1) % 7; // Saturday-first week
  const wk = t('wk'); const order = [6, 0, 1, 2, 3, 4, 5];
  const byDay = useMemo(() => { const map = {}; (data?.items || []).forEach((i) => { (map[i.scheduled_date] ||= []).push(i); }); return map; }, [data]);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setMonth(ym(d)); setSel(null); };
  const todayStr = new Date().toISOString().slice(0, 10);
  const statusOf = (i) => i.operation_status === 'completed' || i.operation_status === 'approved' || i.task_status === 'completed' ? 'completed' : i.task_status === 'cancelled' ? 'cancelled' : i.task_status === 'issue_reported' ? 'issue_reported' : i.scheduled_date < todayStr && !i.operation_id ? 'missed' : i.task_status;
  const monthLabel = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(first);
  const Prev = isRtl ? ChevronRight : ChevronLeft, Next = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy-900">{t('calendar')}</h1>
      {me && me.vehicles.length > 1 && <select className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white" value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setSel(null); }}><option value="">{t('allVehicles')}</option>{me.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber} · {v.brand || ''} {v.model || ''}</option>)}</select>}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2"><button onClick={() => shift(-1)} className="p-2 rounded-lg hover:bg-slate-100"><Prev size={18} /></button><p className="font-semibold">{monthLabel}</p><button onClick={() => shift(1)} className="p-2 rounded-lg hover:bg-slate-100"><Next size={18} /></button></div>
        <div className="grid grid-cols-7 text-center text-[11px] text-slate-400 mb-1">{order.map((d) => <span key={d}>{wk[d]}</span>)}</div>
        {!data ? <div className="py-10 text-center"><Spinner /></div> : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => <span key={'e' + i} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = `${month}-${String(i + 1).padStart(2, '0')}`; const items = byDay[d] || []; const isSel = sel?.scheduled_date === d && !sel.operation_id ? false : items.some((x) => x === sel);
              return (
                <button key={d} type="button" disabled={!items.length} onClick={() => setSel(items[0])} className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm ${d === todayStr ? 'ring-2 ring-brand-500' : ''} ${isSel ? 'bg-navy-900 text-white' : items.length ? 'bg-slate-50 hover:bg-slate-100' : 'text-slate-400'}`}>
                  <span className={items.length ? 'font-semibold' : ''}>{i + 1}</span>
                  {items.length > 0 && <span className="flex gap-0.5">{items.slice(0, 3).map((it, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${TONE[statusOf(it)] || 'bg-slate-300'}`} />)}</span>}
                </button>);
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">{[['completed', 'legendDone'], ['assigned', 'legendPlanned'], ['missed', 'legendMissed'], ['issue_reported', 'legendIssue']].map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE[k]}`} />{t(l)}</span>)}</div>
      </Card>

      {data && !data.items.length && <Card className="p-6 text-center text-slate-500 text-sm">{t('noWashes')}</Card>}
      {data && data.items.length > 0 && !sel && <div className="space-y-2">{data.items.map((i) => <Card key={i.task_id} onClick={() => setSel(i)} className="p-3 text-sm flex items-center justify-between"><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${TONE[statusOf(i)] || 'bg-slate-300'}`} /><div><p className="font-medium">{fmtDate(i.scheduled_date, lang)}</p><p className="text-xs text-slate-500" dir="ltr">{i.plate_number}</p></div></div><div className="text-end text-xs text-slate-500"><p>{t(`ts_${statusOf(i) === 'missed' ? 'cancelled' : statusOf(i)}`)}</p>{(i.before_count > 0 || i.after_count > 0) && <p className="flex items-center gap-1 justify-end"><Camera size={12} />{i.before_count + i.after_count}</p>}</div></Card>)}</div>}

      {sel && (
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between"><div><p className="font-semibold">{t('washDetails')}</p><p className="text-sm text-slate-600">{fmtDate(sel.scheduled_date, lang)} · <span dir="ltr">{sel.plate_number}</span></p></div><button onClick={() => setSel(null)} className="p-1 rounded-md hover:bg-slate-100"><X size={18} /></button></div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><p className="text-xs text-slate-500">{t('status')}</p><p className="font-medium flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${TONE[statusOf(sel)] || 'bg-slate-300'}`} />{t(`ts_${statusOf(sel) === 'missed' ? 'cancelled' : statusOf(sel)}`)}</p></div>
            {sel.staff_name && <div><p className="text-xs text-slate-500">{t('staff')}</p><p className="font-medium">{sel.staff_name}</p></div>}
            {sel.start_time && <div><p className="text-xs text-slate-500">{t('duration')}</p><p className="font-medium">{fmtTime(sel.start_time, lang)}{sel.end_time ? ` → ${fmtTime(sel.end_time, lang)} (${Math.round((new Date(sel.end_time) - new Date(sel.start_time)) / 60000)} ${t('minutes')})` : ''}</p></div>}
            {sel.notes && <div className="col-span-2"><p className="text-xs text-slate-500">{t('notes')}</p><p>{sel.notes}</p></div>}
          </div>
          {sel.operation_id && (!detail ? <div className="py-4 text-center"><Spinner /></div> : (
            <div className="grid grid-cols-2 gap-3">{['before', 'after'].map((phase) => { const ph = detail.photos.filter((p) => p.phase === phase); return (
              <div key={phase}><p className="text-xs font-semibold text-slate-500 mb-1.5">{t(phase)} ({ph.length})</p>
                <div className="grid grid-cols-2 gap-1.5">{ph.map((p) => <AuthImg key={p.id} src={`/photos/${p.id}`} className="aspect-square w-full rounded-lg object-cover cursor-zoom-in" onClick={() => setZoom(p.id)} />)}{!ph.length && <div className="aspect-square rounded-lg bg-slate-100 grid place-items-center text-slate-300"><Camera /></div>}</div></div>); })}</div>
          ))}
        </Card>
      )}
      {zoom && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setZoom(null)}><AuthImg src={`/photos/${zoom}`} className="max-h-full max-w-full rounded-lg object-contain" /><button className="absolute top-4 end-4 text-white"><X size={28} /></button></div>}
    </div>
  );
}
