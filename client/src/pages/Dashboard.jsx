import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Home, Car, UserPlus, FileText, Clock, AlertTriangle, RefreshCw, CreditCard, Droplets, CheckCircle2, ListTodo, Wallet, Hourglass } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { fmtMoney, fmtNum, monthLabel, fmtDateTime } from '../lib/format.js';
import { PageHeader, KpiCard, Loading, ErrorBox, Select, Input, Empty, StatusBadge } from '../components/ui.jsx';

const ENTITY_ROUTES = { subscription: '/subscriptions/', vehicle: '/vehicles/', owner: '/owners/', unit: '/units/', compound: '/compounds/', payment: '/payments?search=', registration_request: '/registration-requests' };
const entityPath = (a) => { const r = ENTITY_ROUTES[a.entity_type]; if (!r) return null; if (a.entity_type === 'payment') return '/payments'; if (a.entity_type === 'registration_request') return r; return a.entity_id ? r + a.entity_id : null; };
const STATUS_COLORS = { active: '#059669', expiring_soon: '#ea580c', expired: '#dc2626', pending_payment: '#f59e0b', suspended: '#64748b', cancelled: '#94a3b8' };

function ChartCard({ title, children, className = '' }) {
  return <div className={`card p-4 ${className}`}><p className="text-sm font-semibold text-navy-900 mb-3">{title}</p>{children}</div>;
}

export default function Dashboard() {
  const { t, lang, isRtl } = useI18n();
  const { company } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ compoundId: '', dateFrom: '', dateTo: '' });
  const { data, loading, error, reload } = useQuery('/admin/dashboard', filters);
  useEffect(() => { const id = setInterval(reload, 60000); return () => clearInterval(id); }, [reload]);
  const lookups = useLookups();
  const cur = company?.currency || 'EGP';
  const money = (v) => fmtMoney(v, cur, lang);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const k = data?.kpis;
  const monthly = (data?.monthly || []).map((m) => ({ ...m, label: monthLabel(m.month, lang), revenue: Number(m.revenue) }));
  const statusData = (data?.statusBreakdown || []).map((s) => ({ name: t(`status.${s.status}`), value: s.count, key: s.status }));
  const tooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 };

  return (
    <div className="fade-in">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} actions={
        <div className="flex flex-wrap gap-2">
          <Select value={filters.compoundId} onChange={(e) => setFilters({ ...filters, compoundId: e.target.value })} className="w-48">
            <option value="">{t('dashboard.allCompounds')}</option>
            {lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="w-40" />
          <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="w-40" />
        </div>} />

      {loading && !data ? <Loading rows={8} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <KpiCard label={t('dashboard.compounds')} value={fmtNum(k.compounds, lang)} icon={Building2} onClick={() => navigate('/compounds')} />
            <KpiCard label={t('dashboard.units')} value={fmtNum(k.units, lang)} icon={Home} onClick={() => navigate('/units')} />
            <KpiCard label={t('dashboard.vehicles')} value={fmtNum(k.vehicles, lang)} icon={Car} onClick={() => navigate('/vehicles')} />
            <KpiCard label={t('dashboard.active')} value={fmtNum(k.active_subscriptions, lang)} icon={FileText} tone="success" onClick={() => navigate('/subscriptions?status=active,expiring_soon')} />
            <KpiCard label={t('dashboard.expiring')} value={fmtNum(k.expiring_subscriptions, lang)} icon={Clock} tone="warning" onClick={() => navigate('/renewals')} />
            <KpiCard label={t('dashboard.expired')} value={fmtNum(k.expired_subscriptions, lang)} icon={AlertTriangle} tone="danger" onClick={() => navigate('/renewals?filter=expired')} />
            <KpiCard label={t('dashboard.pendingRenewals')} value={fmtNum(k.pending_renewals, lang)} icon={RefreshCw} tone="warning" onClick={() => navigate('/renewals?filter=pending')} />
            <KpiCard label={t('dashboard.pendingPayments')} value={fmtNum(k.pending_payments, lang)} icon={CreditCard} tone="warning" onClick={() => navigate('/payments?status=pending_verification')} />
            <KpiCard label={t('dashboard.newRegistrations')} value={fmtNum(k.pending_registrations, lang)} icon={UserPlus} tone={k.pending_registrations ? 'warning' : 'default'} onClick={() => navigate('/registration-requests')} />
            <KpiCard label={t('dashboard.washesToday')} value={fmtNum(k.washes_today, lang)} icon={Droplets} tone="info" onClick={() => navigate('/operations')} />
            <KpiCard label={t('dashboard.completedToday')} value={fmtNum(k.washes_completed_today, lang)} icon={CheckCircle2} tone="success" onClick={() => navigate('/operations')} />
            <KpiCard label={t('dashboard.pendingTasks')} value={fmtNum(k.pending_wash_tasks, lang)} icon={ListTodo} />
            <KpiCard label={t('dashboard.revenue')} value={money(k.total_revenue)} icon={Wallet} tone="success" hint={`${t('dashboard.outstanding')}: ${money(k.outstanding)}`} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <ChartCard title={t('dashboard.subscriptionsByMonth')} className="lg:col-span-2">
              <div dir="ltr"><ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="new_subscriptions" name={t('dashboard.newSubs')} fill="#0b1f3a" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => navigate(`/subscriptions?month=${d.month}&kind=new`)} />
                  <Bar dataKey="renewals" name={t('dashboard.renewals')} fill="#2f6fff" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => navigate(`/subscriptions?month=${d.month}&kind=renewal`)} />
                </BarChart>
              </ResponsiveContainer></div>
            </ChartCard>
            <ChartCard title={t('dashboard.statusMix')}>
              {statusData.length ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart><Pie data={statusData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>{statusData.map((s) => <Cell key={s.key} fill={STATUS_COLORS[s.key] || '#94a3b8'} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
                  </ResponsiveContainer>
                  <ul className="flex-1 space-y-1.5 text-sm">{statusData.map((s) => <li key={s.key}><button onClick={() => navigate(`/subscriptions?status=${s.key}`)} className="flex w-full items-center justify-between gap-2 rounded px-1 hover:bg-slate-50"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s.key] }} />{s.name}</span><span className="font-semibold text-slate-700">{s.value}</span></button></li>)}</ul>
                </div>
              ) : <Empty />}
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">{t('dashboard.conversion')}: <span className="text-navy-900 text-base">{data.conversion.rate === null ? '—' : `${data.conversion.rate}%`}</span></p>
                <p>{t('dashboard.conversionHint', { renewed: data.conversion.renewed, ended: data.conversion.ended })}</p>
              </div>
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <ChartCard title={t('dashboard.revenueByMonth')}>
              <div dir="ltr"><ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} /><Line type="monotone" dataKey="revenue" name={t('dashboard.revenue')} stroke="#1f5eff" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer></div>
            </ChartCard>
            <ChartCard title={t('dashboard.revenueByCompound')}>
              <ul className="space-y-2.5">{data.revenueByCompound.map((c) => { const max = Math.max(...data.revenueByCompound.map((x) => Number(x.revenue)), 1); return (
                <li key={c.id} className="text-sm cursor-pointer rounded px-1 hover:bg-slate-50" onClick={() => navigate(`/compounds/${c.id}`)}><div className="flex justify-between mb-1"><span className="text-slate-700 truncate">{c.name}</span><span className="font-semibold text-navy-900">{money(c.revenue)}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${(Number(c.revenue) / max) * 100}%` }} /></div></li>); })}</ul>
            </ChartCard>
            <ChartCard title={t('dashboard.revenueByPlan')}>
              <table className="w-full text-sm"><tbody>{data.revenueByPlan.map((p, i) => <tr key={i} className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50" onClick={() => navigate('/plans')}><td className="py-2 text-slate-700">{p.plan}<span className="block text-[11px] text-slate-400">{t(`plans.types.${p.plan_type}`)} · {p.subscriptions} {t('nav.subscriptions').toLowerCase()}</span></td><td className="py-2 text-end font-semibold text-navy-900">{money(p.revenue)}</td></tr>)}</tbody></table>
            </ChartCard>
          </div>

          {data.latest?.length > 0 && <ChartCard title={t('dashboard.latest')} className="mb-4">
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>{t('subs.code')}</th><th>{t('common.vehicles')}</th><th>{t('common.owner')}</th><th>{t('common.compound')}</th><th>{t('common.plan')}</th><th>{t('subs.finalAmount')}</th><th>{t('common.status')}</th><th>{t('common.createdAt')}</th></tr></thead>
              <tbody>{data.latest.map((s) => <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/subscriptions/${s.id}`)}><td className="font-mono text-xs">{s.subscription_code}{s.renewed_from_id && <span className="ms-1 rounded bg-brand-50 px-1 text-[10px] text-brand-700">{t('dashboard.renewals')}</span>}</td><td dir="ltr">{s.plates}</td><td>{s.owner_name}</td><td>{s.compound_name}</td><td>{s.plan_name}</td><td>{money(s.final_amount)}</td><td><StatusBadge status={s.status} /></td><td className="text-xs text-slate-500">{fmtDateTime(s.created_at, lang)}</td></tr>)}</tbody></table></div>
          </ChartCard>}
          <div className="grid lg:grid-cols-3 gap-4">
            <ChartCard title={t('dashboard.operations')}>
              {data.operations.length ? <ul className="space-y-2 text-sm">{data.operations.map((o) => <li key={o.status} className="flex justify-between"><span>{t(`status.${o.status}`)}</span><span className="font-semibold">{o.count}</span></li>)}</ul>
                : <p className="text-sm text-slate-500 flex items-start gap-2"><Hourglass size={16} className="mt-0.5 shrink-0" />{t('dashboard.noOps')}</p>}
            </ChartCard>
            <ChartCard title={t('dashboard.staffPerformance')}>
              <table className="w-full text-sm"><tbody>{data.staffPerformance.map((s) => <tr key={s.id} className="border-b border-slate-100 last:border-0"><td className="py-2 text-slate-700">{s.name}</td><td className="py-2 text-end text-slate-500">{s.completed}/{s.assigned}</td><td className="py-2 text-end text-slate-500">{s.avg_minutes ? `${s.avg_minutes}m` : '—'}</td></tr>)}</tbody></table>
            </ChartCard>
            <ChartCard title={t('dashboard.recent')}>
              <ul className="space-y-2.5 text-sm">{data.recent.map((a) => <li key={a.id} className={`flex justify-between gap-3 ${entityPath(a) ? 'cursor-pointer hover:bg-slate-50 rounded px-1' : ''}`} onClick={() => entityPath(a) && navigate(entityPath(a))}><span className="text-slate-700 min-w-0 flex items-center gap-2"><span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5 shrink-0" dir="ltr">{a.action}</span><span className="truncate">{a.user_name || t('audit.system')}</span></span><span className="text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(a.created_at, lang)}</span></li>)}</ul>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
