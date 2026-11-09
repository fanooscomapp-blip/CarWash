import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Car, ChevronRight, RefreshCw, Clock, CalendarDays, MapPin, Receipt, ArrowLeft } from 'lucide-react';
import { papi, usePortal, fmtDate, fmtMoney, Badge } from './portalLib.jsx';
import { Card, BigButton, Spinner, Center } from './PortalLayout.jsx';

function useLoad(fn, deps) { const [s, setS] = useState({ data: null, err: null }); useEffect(() => { let a = true; setS({ data: null, err: null }); fn().then((d) => a && setS({ data: d, err: null })).catch((e) => a && setS({ data: null, err: e })); return () => { a = false; }; }, deps); return s; } // eslint-disable-line
const pName = (x, lang) => (lang === 'ar' && (x?.planNameAr)) ? x.planNameAr : x?.planName;

export function VehicleCard({ v, onClick }) {
  const { t, lang, company } = usePortal(); const cur = company?.currency || 'EGP';
  const pct = v.washesAllowed ? Math.min(100, Math.round((v.washesUsed / v.washesAllowed) * 100)) : 0;
  return (
    <Card onClick={onClick} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-lg font-bold text-navy-900" dir="ltr">{v.plateNumber}</p><p className="text-sm text-slate-500 truncate">{[v.brand, v.model].filter(Boolean).join(' ')}{v.color ? ` · ${v.color}` : ''}</p><p className="text-xs text-slate-400 mt-0.5">{t('unit')} {v.unitNumber} · {v.compoundName}</p></div>
        <Badge status={v.subscriptionStatus} label={!v.subscriptionId ? t('noSub') : undefined} />
      </div>
      {v.subscriptionId && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-sm"><span className="text-slate-600">{pName(v, lang)}</span><span className={`font-semibold ${v.daysRemaining < 0 ? 'text-red-600' : v.daysRemaining <= 7 ? 'text-orange-600' : 'text-slate-700'}`}>{v.daysRemaining >= 0 ? t('daysLeft', { n: v.daysRemaining }) : t('expiredAgo', { n: -v.daysRemaining })}</span></div>
          <div><div className="flex justify-between text-xs text-slate-500 mb-1"><span>{t('washesUsed', { u: v.washesUsed, a: v.washesAllowed })}</span><span>{t('expiresOn')} {fmtDate(v.endDate, lang)}</span></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} /></div></div>
        </div>
      )}
    </Card>
  );
}

export function HomePage() {
  const { t, lang, owner } = usePortal(); const navigate = useNavigate();
  const { data, err } = useLoad(() => papi.get('/me').then((r) => r.data), []);
  if (err) return <Center><p>{t('error')}</p></Center>;
  if (!data) return <Center><Spinner /></Center>;
  const tiles = [[t('vehicles'), data.vehicles.length, 'text-navy-900'], [t('active'), data.stats.active, 'text-emerald-600'], [t('expiring'), data.stats.expiring, 'text-orange-600'], [t('pendingRequests'), data.stats.pending_requests, 'text-amber-600']];
  return (
    <div className="space-y-4">
      <div><p className="text-sm text-slate-500">{t('hello')} 👋</p><h1 className="text-2xl font-bold text-navy-900">{data.owner.name}</h1><p className="text-sm text-slate-500 mt-0.5">{data.units.map((u) => `${t('unit')} ${u.unitNumber} · ${u.compoundName}`).join(' / ')}</p></div>
      <div className="grid grid-cols-2 gap-3">{tiles.map(([l, v, c]) => <Card key={l} className="p-4"><p className="text-xs text-slate-500">{l}</p><p className={`text-2xl font-bold ${c}`}>{v}</p></Card>)}</div>
      <div className="flex items-center justify-between px-1"><p className="font-semibold text-slate-800">{t('myVehicles')}</p><Link to="/p/vehicles" className="text-xs text-brand-600 font-semibold">{t('viewDetails')} ›</Link></div>
      {!data.vehicles.length ? <Card className="p-6 text-center text-slate-500 text-sm">{t('noVehicles')}</Card> : <div className="space-y-3">{data.vehicles.slice(0, 3).map((v) => <VehicleCard key={v.id} v={v} onClick={() => navigate(`/p/vehicles/${v.id}`)} />)}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Card onClick={() => navigate('/p/washes')} className="p-4 flex items-center gap-3"><CalendarDays className="text-brand-600" /><span className="font-semibold text-sm">{t('calendar')}</span></Card>
        <Card onClick={() => navigate('/p/requests')} className="p-4 flex items-center gap-3"><Receipt className="text-brand-600" /><span className="font-semibold text-sm">{t('requests')}</span></Card>
      </div>
    </div>
  );
}

export function VehiclesPage() {
  const { t } = usePortal(); const navigate = useNavigate();
  const { data } = useLoad(() => papi.get('/me').then((r) => r.data), []);
  if (!data) return <Center><Spinner /></Center>;
  return <div className="space-y-3"><h1 className="text-xl font-bold text-navy-900">{t('myVehicles')}</h1>{!data.vehicles.length ? <Card className="p-6 text-center text-slate-500 text-sm">{t('noVehicles')}</Card> : data.vehicles.map((v) => <VehicleCard key={v.id} v={v} onClick={() => navigate(`/p/vehicles/${v.id}`)} />)}</div>;
}

export function VehicleDetailPage() {
  const { id } = useParams(); const { t, lang, company } = usePortal(); const navigate = useNavigate(); const cur = company?.currency || 'EGP';
  const { data, err } = useLoad(() => papi.get(`/vehicles/${id}`).then((r) => r.data), [id]);
  if (err) return <Center><p>{t('error')}</p></Center>;
  if (!data) return <Center><Spinner /></Center>;
  const { vehicle: v, current: c } = data; const wk = t('wk');
  const pendingReq = data.subscriptions.find((s) => s.status === 'pending_payment');
  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500"><ArrowLeft size={16} className="rtl:rotate-180" />{t('back')}</button>
      <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-2xl font-bold text-navy-900" dir="ltr">{v.plateNumber}</p><p className="text-sm text-slate-500">{[v.brand, v.model, v.color].filter(Boolean).join(' · ')}</p><p className="text-xs text-slate-400 mt-1">{t('unit')} {v.unitNumber} · {v.compoundName}</p>{v.parkingLocation && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin size={12} />{v.parkingLocation}</p>}</div><Car size={32} className="text-slate-300" /></div></Card>
      {c ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between"><p className="font-semibold text-slate-800">{pName(c, lang)}</p><Badge status={c.status} /></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-slate-500">{t('startedOn')}</p><p className="font-medium">{fmtDate(c.startDate, lang)}</p></div><div><p className="text-xs text-slate-500">{t('expiresOn')}</p><p className="font-medium">{fmtDate(c.endDate, lang)}</p></div>
            <div><p className="text-xs text-slate-500">{t('washesUsed', { u: c.washesUsed, a: c.washesAllowed })}</p><p className="font-medium text-brand-600">{t('washesLeft', { n: Math.max(0, c.washesAllowed - c.washesUsed) })}</p></div><div><p className="text-xs text-slate-500">{t('nextWash')}</p><p className="font-medium">{data.nextWash ? fmtDate(data.nextWash, lang) : '—'}</p></div>
          </div>
          <div><p className="text-xs text-slate-500 mb-1">{t('allowedDays')} · {t('perWeek', { n: c.frequencyPerWeek })}</p><div className="flex gap-1">{[6, 0, 1, 2, 3, 4, 5].map((d) => <span key={d} className={`flex-1 rounded-md py-1 text-center text-[11px] font-medium ${c.allowedDays.includes(d) ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-400'}`}>{wk[d]}</span>)}</div></div>
          {pendingReq ? <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-center gap-2"><Clock size={16} />{t('renewPending')} · <span className="font-mono text-xs">{pendingReq.code}</span></div>
            : data.renewLink && <BigButton onClick={() => navigate(data.renewLink)} className="bg-brand-600 text-white hover:bg-brand-500 flex items-center justify-center gap-2"><RefreshCw size={18} />{t('renewNow')}</BigButton>}
        </Card>
      ) : <Card className="p-6 text-center text-slate-500">{t('noSub')}</Card>}
      <div><p className="px-1 mb-2 font-semibold text-slate-800">{t('history')}</p><div className="space-y-2">{data.subscriptions.map((s) => <Card key={s.id} className="p-3 text-sm flex items-center justify-between gap-2"><div><p className="font-medium">{pName(s, lang)} <span className="font-mono text-[11px] text-slate-400">{s.code}</span></p><p className="text-xs text-slate-500">{fmtDate(s.startDate, lang)} → {fmtDate(s.endDate, lang)} · {s.washesUsed}/{s.washesAllowed}</p></div><div className="text-end"><Badge status={s.status} /><p className="text-xs text-slate-500 mt-1">{fmtMoney(s.finalAmount, cur, lang)}</p></div></Card>)}</div></div>
      {data.payments.length > 0 && <div><p className="px-1 mb-2 font-semibold text-slate-800">{t('payments')}</p><div className="space-y-2">{data.payments.map((p) => <Card key={p.id} className="p-3 text-sm flex items-center justify-between"><div><p className="font-medium">{fmtMoney(p.amount, cur, lang)} <span className="font-mono text-[11px] text-slate-400">{p.code}</span></p><p className="text-xs text-slate-500">{fmtDate(p.paymentDate || p.createdAt, lang)}</p>{p.rejectionReason && <p className="text-xs text-red-600">{p.rejectionReason}</p>}</div><Badge status={p.status} /></Card>)}</div></div>}
    </div>
  );
}

export function RequestsPage() {
  const { t, lang, company } = usePortal(); const navigate = useNavigate(); const cur = company?.currency || 'EGP';
  const { data } = useLoad(() => papi.get('/requests').then((r) => r.data), []);
  if (!data) return <Center><Spinner /></Center>;
  return (
    <div className="space-y-3"><h1 className="text-xl font-bold text-navy-900">{t('requests')}</h1>
      {!data.length ? <Card className="p-6 text-center text-slate-500 text-sm">{t('noRequests')}</Card> : data.map((r) => (
        <Card key={r.id} className="p-4 text-sm space-y-2">
          <div className="flex items-start justify-between gap-2"><div><p className="font-semibold" dir="ltr">{r.plates}</p><p className="text-xs text-slate-500">{pName({ planName: r.plan_name, planNameAr: r.plan_name_ar }, lang)} · {fmtDate(r.start_date, lang)} → {fmtDate(r.end_date, lang)}</p></div><Badge status={r.status} /></div>
          <div className="flex items-center justify-between text-xs text-slate-500"><span>{t('request')} <span className="font-mono">{r.subscription_code}</span> · {t('submittedOn')} {fmtDate(r.created_at, lang)}</span><span className="font-semibold text-slate-700">{fmtMoney(r.amount, cur, lang)}</span></div>
          {r.rejection_reason && r.status === 'awaiting_new_receipt' && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-xs"><b>{t('rejectedReason')}:</b> {r.rejection_reason}</p>}
          {r.status === 'awaiting_new_receipt' && r.renewal_token && <BigButton onClick={() => navigate(`/p/renew/${r.renewal_token}`)} className="bg-red-600 text-white text-sm py-2.5">{t('reupload')}</BigButton>}
        </Card>))}
    </div>
  );
}
