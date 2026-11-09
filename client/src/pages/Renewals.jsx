import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useQuery, useDebounced, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { PageHeader, DataTable, SearchInput, Select, StatusBadge, Tabs } from '../components/ui.jsx';
import RenewModal from '../components/RenewModal.jsx';

const FILTERS = ['expiring', '7', '15', '30', 'expired', 'pending', 'renewed'];
const COUNTER_KEY = { expiring: 'expiring', 7: 'd7', 15: 'd15', 30: 'd30', expired: 'expired', pending: 'pending', renewed: 'renewed' };

export default function Renewals() {
  const { t, lang } = useI18n(); const { can, company } = useAuth(); const navigate = useNavigate(); const lookups = useLookups();
  const [sp, setSp] = useSearchParams();
  const filter = sp.get('filter') || '7';
  const [search, setSearch] = useState(''); const [compoundId, setCompoundId] = useState(''); const [page, setPage] = useState(1); const [renew, setRenew] = useState(null);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/subscriptions/renewals', { filter, search: q, compoundId, page, pageSize: 20 });
  const cur = company?.currency || 'EGP';
  const labelFor = (f) => t(`renewals.${/^\d+$/.test(f) ? 'd' + f : f}`);
  const columns = [
    { key: 'plates', header: t('vehicles.plate'), render: (r) => <div><p className="font-semibold" dir="ltr">{r.plates}</p><p className="text-xs text-slate-500 font-mono">{r.subscriptionCode}</p></div> },
    { key: 'unitNumber', header: t('common.unit'), render: (r) => <div><p>{r.unitNumber}</p><p className="text-xs text-slate-500">{r.compoundName}</p></div> },
    { key: 'ownerName', header: t('common.owner'), render: (r) => <div><p>{r.ownerName}</p><p className="text-xs text-slate-500" dir="ltr">{r.ownerMobile}</p></div> },
    { key: 'planName', header: t('renewals.currentPlan'), render: (r) => lang === 'ar' && r.planNameAr ? r.planNameAr : r.planName },
    { key: 'endDate', header: t('renewals.expiry'), render: (r) => <div><p>{fmtDate(r.endDate, lang)}</p><p className={`text-xs ${r.daysRemaining < 0 ? 'text-red-600' : r.daysRemaining <= 7 ? 'text-orange-600' : 'text-slate-500'}`}>{r.daysRemaining < 0 ? `${-r.daysRemaining} ${t('common.days')} ${t('status.expired').toLowerCase()}` : `${r.daysRemaining} ${t('common.days')} ${t('common.remaining')}`}</p></div> },
    { key: 'renewalPrice', header: t('renewals.renewalPrice'), render: (r) => fmtMoney(r.renewalPrice, cur, lang) },
    { key: 'status', header: t('renewals.renewalStatus'), render: (r) => <div><StatusBadge status={r.status} />{r.renewedToId && <p className="text-[11px] text-slate-500 mt-1">{t('subs.renewedTo')}: <StatusBadge status={r.renewedToStatus} /></p>}</div> },
    { key: 'actions', header: '', className: 'text-end', render: (r) => (
      r.renewedToStatus === 'pending_payment' && r.pendingRenewalPaymentId !== undefined ? null
        : !r.renewedToId && can('subscriptions.renew', 'subscriptions.manage') ? <button className="btn-accent btn-sm" onClick={(e) => { e.stopPropagation(); setRenew(r); }}><RefreshCw size={13} />{t('renewals.quickRenew')}</button>
        : r.renewedToId ? <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/subscriptions/${r.renewedToId}`); }}>{t('common.view')}</button> : null) },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('renewals.title')} subtitle={t('renewals.subtitle')} />
      <Tabs value={filter} onChange={(v) => { const n = new URLSearchParams(sp); n.set('filter', v); setSp(n); setPage(1); }} tabs={FILTERS.map((f) => ({ value: f, label: labelFor(f), count: data?.counters?.[COUNTER_KEY[f]] }))} />
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-72" />
        <Select value={compoundId} onChange={(e) => { setCompoundId(e.target.value); setPage(1); }} className="w-48"><option value="">{t('dashboard.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/subscriptions/${r.id}`)} />
      {renew && <RenewModal open onClose={() => setRenew(null)} subscription={renew} onRenewed={reload} />}
    </div>
  );
}
