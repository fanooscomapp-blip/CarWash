import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Ban, Upload, FileText } from 'lucide-react';
import { useQuery, useDebounced, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format.js';
import { PageHeader, DataTable, SearchInput, Select, StatusBadge, KpiCard, Modal, ConfirmDialog, useToast, DescriptionList, Input } from '../components/ui.jsx';

const OUTSTANDING = 'pending_verification,awaiting_new_receipt';
const STATUSES = ['pending_verification', 'approved', 'rejected', 'awaiting_new_receipt'];

function PaymentDetail({ id, onClose, onChanged }) {
  const { t, lang } = useI18n(); const { can, company } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const { data: p, loading, reload } = useQuery(`/admin/payments/${id}`);
  const [dialog, setDialog] = useState(null); const [busy, setBusy] = useState(false); const fileRef = useRef();
  const cur = company?.currency || 'EGP';
  const act = async (fn, msg) => { setBusy(true); try { await fn(); toast.success(msg || t('common.success')); setDialog(null); reload(); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const upload = async (file) => { if (!file) return; const fd = new FormData(); fd.append('receipt', file); await act(() => api.post(`/admin/payments/${id}/receipts`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })); };
  const openReceipt = async (r) => { const res = await api.get(`/admin/payments/${id}/receipts/${r.id}`, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank'); };
  const pending = p && ['pending_verification', 'awaiting_new_receipt'].includes(p.status);
  return (
    <Modal open onClose={onClose} title={p ? `${t('common.payment')} ${p.paymentCode}` : t('common.loading')} size="lg"
      footer={p && <>
        <button className="btn-secondary" onClick={() => navigate(`/subscriptions/${p.subscriptionId}`)}>{t('common.subscription')} →</button>
        {can('payments.approve') && pending && <><button className="btn-danger" onClick={() => setDialog('reject')}><Ban size={16} />{t('payments.reject')}</button><button className="btn-success" onClick={() => setDialog('approve')}><CheckCircle2 size={16} />{t('payments.approve')}</button></>}
      </>}>
      {!p ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : (
        <div className="space-y-5">
          <div className="flex items-center justify-between"><p className="text-2xl font-semibold text-navy-900">{fmtMoney(p.amount, cur, lang)}</p><StatusBadge status={p.status} /></div>
          <DescriptionList cols={3} items={[[t('common.owner'), <span>{p.ownerName} <span dir="ltr" className="text-xs text-slate-500">{p.ownerMobile}</span></span>], [t('common.subscription'), <span className="font-mono text-xs">{p.subscriptionCode}</span>], [t('common.vehicles'), <span dir="ltr">{p.plates}</span>], [t('common.unit'), `${p.unitNumber} · ${p.compoundName}`], [t('common.plan'), p.planName], [t('payments.method'), t(`subs.methods.${p.method}`)], [t('common.date'), fmtDate(p.paymentDate || p.createdAt, lang)], p.approvedByName && [t('payments.approvedBy'), `${p.approvedByName} · ${fmtDateTime(p.approvedAt, lang)}`], p.rejectionReason && [t('subs.rejectReason'), <span className="text-red-600">{p.rejectionReason}</span>], [t('common.notes'), p.notes]]} />
          <div>
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-semibold">{t('payments.receipts')}</p>{can('payments.approve', 'subscriptions.manage') && <><input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /><button className="btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current.click()}><Upload size={14} />{t('payments.uploadReceipt')}</button></>}</div>
            {!p.receipts.length ? <p className="text-sm text-slate-500">{t('payments.noReceipts')}</p> : <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{p.receipts.map((r) => <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm"><span className="flex items-center gap-2 truncate"><FileText size={15} className="text-slate-400" />{r.originalName || r.filePath}<span className="text-xs text-slate-400">· {r.uploadedByType} · {fmtDateTime(r.uploadedAt, lang)}</span></span><button className="btn-ghost btn-sm" onClick={() => openReceipt(r)}>{t('payments.viewReceipt')}</button></li>)}</ul>}
          </div>
        </div>
      )}
      <ConfirmDialog open={dialog === 'approve'} onClose={() => setDialog(null)} loading={busy} title={t('payments.approve')} message={t('payments.approveConfirm')} confirmLabel={t('payments.approve')} onConfirm={() => act(() => api.post(`/admin/payments/${id}/approve`, {}), t('payments.approved_ok'))} />
      <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} loading={busy} danger title={t('payments.reject')} reasonLabel={t('subs.rejectReason')} confirmLabel={t('payments.reject')} onConfirm={(reason) => act(() => api.post(`/admin/payments/${id}/reject`, { reason }))} />
    </Modal>
  );
}

export default function Payments() {
  const { t, lang } = useI18n(); const { company } = useAuth(); const lookups = useLookups();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState(sp.get('search') || ''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const filters = { status: sp.get('status') || '', compoundId: sp.get('compoundId') || '', method: sp.get('method') || '', dateFrom: sp.get('dateFrom') || '', dateTo: sp.get('dateTo') || '' };
  const setFilter = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); setPage(1); };
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/payments', { search: q, ...filters, page, pageSize: 20 });
  const cur = company?.currency || 'EGP';
  const columns = [
    { key: 'paymentCode', header: t('payments.code'), render: (r) => <div><p className="font-mono text-xs font-semibold">{r.paymentCode}</p><p className="text-xs text-slate-500 font-mono">{r.subscriptionCode}</p></div> },
    { key: 'ownerName', header: t('common.owner'), render: (r) => <div><p>{r.ownerName}</p><p className="text-xs text-slate-500">{t('common.unit')} {r.unitNumber} · {r.compoundName}</p></div> },
    { key: 'plates', header: t('common.vehicles'), render: (r) => <span dir="ltr">{r.plates}</span> },
    { key: 'amount', header: t('common.amount'), render: (r) => <span className="font-semibold">{fmtMoney(r.amount, cur, lang)}</span> },
    { key: 'method', header: t('payments.method'), render: (r) => t(`subs.methods.${r.method}`) },
    { key: 'createdAt', header: t('common.date'), render: (r) => fmtDate(r.paymentDate || r.createdAt, lang) },
    { key: 'receiptsCount', header: t('payments.receipts') },
    { key: 'status', header: t('common.status'), render: (r) => <div><StatusBadge status={r.status} />{r.approvedByName && <p className="text-[11px] text-slate-500 mt-1">{r.approvedByName}</p>}</div> },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('payments.title')} />
      {data?.totals && <div className="grid grid-cols-3 gap-3 mb-5">
        <KpiCard label={t('payments.approvedTotal')} value={fmtMoney(data.totals.approved, cur, lang)} tone="success" active={filters.status === 'approved'} onClick={() => setFilter('status', filters.status === 'approved' ? '' : 'approved')} />
        <KpiCard label={t('payments.outstandingTotal')} value={fmtMoney(data.totals.outstanding, cur, lang)} tone="warning" active={filters.status === OUTSTANDING} onClick={() => setFilter('status', filters.status === OUTSTANDING ? '' : OUTSTANDING)} />
        <KpiCard label={t('payments.pendingCount')} value={data.totals.pending_count} tone="warning" active={filters.status === 'pending_verification'} onClick={() => setFilter('status', filters.status === 'pending_verification' ? '' : 'pending_verification')} />
      </div>}
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-64" />
        <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-48"><option value="">{t('common.status')}: {t('common.all')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}<option value={OUTSTANDING}>{t('payments.outstandingTotal')}</option></Select>
        <Select value={filters.compoundId} onChange={(e) => setFilter('compoundId', e.target.value)} className="w-44"><option value="">{t('dashboard.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={filters.method} onChange={(e) => setFilter('method', e.target.value)} className="w-40"><option value="">{t('payments.method')}: {t('common.all')}</option>{['bank_transfer', 'cash', 'other'].map((m) => <option key={m} value={m}>{t(`subs.methods.${m}`)}</option>)}</Select>
        <Input type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} className="w-40" /><Input type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} className="w-40" />
      </div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => setOpen(r.id)} />
      {open && <PaymentDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
