import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtMoney, fmtNum, todayISO, addDaysISO } from '../lib/format.js';
import { PageHeader, Tabs, Select, Input, Spinner, useToast, Loading, ErrorBox, Empty } from '../components/ui.jsx';

const KEYS = ['subscriptions', 'revenue', 'operations', 'staff', 'followup', 'owners'];
const STATUS_OPTIONS = { subscriptions: ['active', 'expiring_soon', 'expired', 'pending_payment', 'cancelled'], revenue: ['approved', 'pending_verification', 'rejected'] };

export default function Reports() {
  const { t, lang } = useI18n(); const toast = useToast(); const lookups = useLookups();
  const [sp, setSp] = useSearchParams();
  const key = KEYS.includes(sp.get('r')) ? sp.get('r') : 'subscriptions';
  const [f, setF] = useState({ compoundId: '', planId: '', status: '', staffId: '', from: addDaysISO(todayISO(), -30), to: todayISO(), days: 15 });
  const usesDates = ['revenue', 'operations', 'staff', 'subscriptions'].includes(key);
  const params = useMemo(() => ({ lang, compoundId: f.compoundId || undefined, planId: ['subscriptions', 'revenue'].includes(key) ? f.planId || undefined : undefined, status: STATUS_OPTIONS[key] ? f.status || undefined : undefined, staffId: key === 'staff' ? f.staffId || undefined : undefined, from: usesDates ? f.from || undefined : undefined, to: usesDates ? f.to || undefined : undefined, days: key === 'followup' ? f.days : undefined }), [key, f, lang, usesDates]);
  const { data, loading, error, reload } = useQuery(`/admin/reports/${key}`, params);
  const plans = useQuery('/admin/plans', {}, { enabled: ['subscriptions', 'revenue'].includes(key) });
  const staff = useQuery('/admin/staff', {}, { enabled: key === 'staff' });
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setF((x) => ({ ...x, status: '' })); }, [key]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/admin/reports/${key}/export`, { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = `${key}-${todayISO()}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast.error(e.message); } finally { setExporting(false); }
  };
  const cell = (c, v) => { if (v === null || v === undefined || v === '') return '—'; if (c.type === 'money') return fmtMoney(v, 'EGP', lang); if (c.type === 'number') return fmtNum(v, lang); if (c.type === 'percent') return `${v}%`; if (c.type === 'date') return fmtDate(v, lang); return String(v); };
  const summaryChips = data ? Object.entries(data.summary || {}).filter(([, v]) => typeof v !== 'object').map(([k, v]) => <span key={k} className="chip bg-slate-100 text-slate-700">{t(`reports.sum.${k}`) !== `reports.sum.${k}` ? t(`reports.sum.${k}`) : k}: <b>{typeof v === 'number' && /amount/i.test(k) ? fmtMoney(v, 'EGP', lang) : fmtNum(v, lang)}</b></span>) : null;
  const byMonth = data?.summary?.byMonth ? Object.entries(data.summary.byMonth).sort().map(([m, v]) => ({ month: m, amount: v })) : null;

  return (
    <div>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} actions={<button className="btn-primary" disabled={exporting || !data?.rows?.length} onClick={exportXlsx}>{exporting ? <Spinner /> : <FileSpreadsheet size={16} />}{t('reports.export')}</button>} />
      <Tabs value={key} onChange={(v) => { const n = new URLSearchParams(sp); n.set('r', v); setSp(n, { replace: true }); }} tabs={KEYS.map((k) => ({ value: k, label: t(`reports.${k}`) }))} />

      <div className="card p-3 mb-4 flex flex-wrap items-end gap-2">
        <Filter size={16} className="text-slate-400 mb-2.5" />
        <Select value={f.compoundId} onChange={(e) => setF({ ...f, compoundId: e.target.value })} className="!w-auto"><option value="">{t('ops.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        {['subscriptions', 'revenue'].includes(key) && <Select value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })} className="!w-auto"><option value="">{t('reports.allPlans')}</option>{(plans.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
        {STATUS_OPTIONS[key] && <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="!w-auto"><option value="">{key === 'revenue' ? t('reports.approvedOnly') : t('reports.allStatuses')}</option>{STATUS_OPTIONS[key].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select>}
        {key === 'staff' && <Select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })} className="!w-auto"><option value="">{t('reports.allStaff')}</option>{(staff.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
        {usesDates && <><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="!w-auto" /><span className="text-slate-400 mb-2">→</span><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="!w-auto" /></>}
        {key === 'followup' && <label className="text-sm text-slate-600 flex items-center gap-2">{t('reports.withinDays')}<Input type="number" min="1" max="365" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) || 15 })} className="!w-20" /></label>}
        <div className="ms-auto flex flex-wrap gap-2 text-xs">{summaryChips}</div>
      </div>

      {byMonth && byMonth.length > 1 && <div className="card p-4 mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('reports.byMonth')}</p><div dir="ltr" className="h-40"><ResponsiveContainer><BarChart data={byMonth}><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => fmtMoney(v, 'EGP', lang)} /><Bar dataKey="amount" fill="#0b1f3a" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>}
      {data?.summary?.byMethod && <div className="mb-4 flex flex-wrap gap-2 text-xs">{Object.entries(data.summary.byMethod).map(([k, v]) => <span key={k} className="chip bg-brand-50 text-brand-700">{k}: <b>{fmtMoney(v, 'EGP', lang)}</b></span>)}{Object.entries(data.summary.byCompound || {}).map(([k, v]) => <span key={k} className="chip bg-slate-100 text-slate-700">{k}: <b>{fmtMoney(v, 'EGP', lang)}</b></span>)}</div>}

      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.rows?.length ? <div className="card"><Empty title={t('reports.empty')} /></div> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto max-h-[70vh]">
          <table className="table"><thead className="sticky top-0 z-10"><tr>{data.columns.map((c, i) => <th key={c.key} className={`${['number', 'money', 'percent'].includes(c.type) ? 'text-end' : ''} ${i === 0 ? 'sticky-start' : ''}`}>{c.label}</th>)}</tr></thead>
            <tbody>{data.rows.map((r, i) => <tr key={i}>{data.columns.map((c, j) => <td key={c.key} className={`${['number', 'money', 'percent'].includes(c.type) ? 'text-end tabular-nums' : ''} ${j === 0 ? 'sticky-start font-medium' : ''} ${c.key === 'mobile' || c.key === 'gps' ? 'font-mono text-xs' : ''} ${c.type === 'date' ? 'whitespace-nowrap' : ''}`} dir={c.key === 'mobile' || c.key === 'gps' || c.type === 'date' ? 'ltr' : undefined}>{cell(c, r[c.key])}</td>)}</tr>)}</tbody></table>
        </div><p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">{t('reports.rows', { n: data.rows.length })} · {t('reports.generated')} {fmtDate(data.generatedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div>
      )}
    </div>
  );
}
