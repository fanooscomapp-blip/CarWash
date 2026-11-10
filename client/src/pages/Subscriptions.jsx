import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, XCircle } from 'lucide-react';
import { useQuery, useDebounced, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { PageHeader, DataTable, SearchInput, Select, StatusBadge, Input, DeleteButton, ConfirmDialog, useToast } from '../components/ui.jsx';
import RenewModal from '../components/RenewModal.jsx';

export default function Subscriptions() {
  const { t, lang } = useI18n(); const toast = useToast(); const { can, company } = useAuth(); const navigate = useNavigate(); const lookups = useLookups();
  const plans = useQuery('/admin/plans');
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [renew, setRenew] = useState(null); const [cancel, setCancel] = useState(null); const [cancelBusy, setCancelBusy] = useState(false);
  const filters = { status: sp.get('status') || '', compoundId: sp.get('compoundId') || '', planId: sp.get('planId') || '', month: sp.get('month') || '', kind: sp.get('kind') || '' };
  const setFilter = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); setPage(1); };
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/subscriptions', { search: q, ...filters, page, pageSize: 20 });
  const cur = company?.currency || 'EGP';
  const columns = [
    { key: 'subscriptionCode', header: t('subs.code'), render: (r) => <div><p className="font-mono text-xs font-semibold">{r.subscriptionCode}</p><p className="text-xs text-slate-500">{lang === 'ar' && r.planNameAr ? r.planNameAr : r.planName}</p></div> },
    { key: 'plates', header: t('common.vehicles'), render: (r) => <span dir="ltr" className="font-medium">{r.plates}</span> },
    { key: 'ownerName', header: t('common.owner'), render: (r) => <div><p>{r.ownerName}</p><p className="text-xs text-slate-500">{t('common.unit')} {r.unitNumber} · {r.compoundName}</p></div> },
    { key: 'period', header: t('subs.period'), render: (r) => <div className="whitespace-nowrap"><p>{fmtDate(r.startDate, lang)} → {fmtDate(r.endDate, lang)}</p>{['active', 'expiring_soon'].includes(r.status) && <p className={`text-xs ${r.daysRemaining <= 7 ? 'text-orange-600' : 'text-slate-500'}`}>{r.daysRemaining} {t('common.days')} {t('common.remaining')}</p>}</div> },
    { key: 'washes', header: t('subs.washes'), render: (r) => `${r.washesUsed} / ${r.washesAllowed}` },
    { key: 'finalAmount', header: t('subs.finalAmount'), render: (r) => <div><p>{fmtMoney(r.finalAmount, cur, lang)}</p><p className="text-xs text-slate-500">{t(`status.${r.paymentStatus}`)}</p></div> },
    { key: 'status', header: t('common.status'), render: (r) => <div><StatusBadge status={r.status} />{r.renewedToId && <p className="text-[11px] text-slate-500 mt-1">{t('subs.renewedTo')} ✓</p>}</div> },
    { key: 'actions', header: '', className: 'text-end', render: (r) => <span className="inline-flex items-center gap-1">
      {can('subscriptions.renew', 'subscriptions.manage') && ['active', 'expiring_soon', 'expired'].includes(r.status) && !r.renewedToId && <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setRenew(r); }}><RefreshCw size={13} />{t('vehicles.renew')}</button>}
      {can('subscriptions.manage') && ['active', 'expiring_soon'].includes(r.status) && <button className="btn-ghost btn-sm" title={t('subs.cancel')} onClick={(e) => { e.stopPropagation(); setCancel(r); }}><XCircle size={14} /></button>}
      {can('subscriptions.manage') && !['active', 'expiring_soon', 'suspended'].includes(r.status) && <DeleteButton url={`/admin/subscriptions/${r.id}`} name={r.subscriptionCode} onDone={reload} />}
    </span> },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('subs.title')} actions={can('subscriptions.manage') && <button className="btn-primary" onClick={() => navigate('/subscriptions/new')}><Plus size={16} />{t('subs.add')}</button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-72" />
        <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-48"><option value="">{t('common.status')}: {t('common.all')}</option><option value="active,expiring_soon">{t('status.active')} + {t('status.expiring_soon')}</option>{(lookups.data?.subscriptionStatuses || []).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select>
        <Select value={filters.compoundId} onChange={(e) => setFilter('compoundId', e.target.value)} className="w-48"><option value="">{t('dashboard.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={filters.planId} onChange={(e) => setFilter('planId', e.target.value)} className="w-48"><option value="">{t('common.plan')}: {t('common.all')}</option>{(plans.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={filters.kind} onChange={(e) => setFilter('kind', e.target.value)} className="w-40"><option value="">{t('common.all')}</option><option value="new">{t('dashboard.newSubs')}</option><option value="renewal">{t('dashboard.renewals')}</option></Select>
        <Input type="month" value={filters.month} onChange={(e) => setFilter('month', e.target.value)} className="w-44" />
      </div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/subscriptions/${r.id}`)} />
      {renew && <RenewModal open onClose={() => setRenew(null)} subscription={renew} onRenewed={reload} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} loading={cancelBusy} danger title={t('subs.cancel')} message={cancel && `${cancel.subscriptionCode} · ${cancel.plates}`} reasonLabel={t('subs.cancelReason')} confirmLabel={t('common.confirm')} onConfirm={async (reason) => { setCancelBusy(true); try { await api.post(`/admin/subscriptions/${cancel.id}/cancel`, { reason }); toast.success(t('common.success')); setCancel(null); reload(); } catch (e) { toast.error(e.message); } finally { setCancelBusy(false); } }} />
    </div>
  );
}
