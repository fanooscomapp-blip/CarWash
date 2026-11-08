import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQuery, useDebounced } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtMoney } from '../lib/format.js';
import { PageHeader, DataTable, StatusBadge, SearchInput, Select, Modal, Field, Input, Textarea, Spinner, useToast } from '../components/ui.jsx';

export function CompoundForm({ open, onClose, initial, onSaved }) {
  const { t } = useI18n(); const toast = useToast();
  const [form, setForm] = useState(initial || { name: '', code: '', address: '', contactPerson: '', contactMobile: '', unitsCount: 0, notes: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = { ...form, unitsCount: Number(form.unitsCount) || 0 };
      const { data } = initial?.id ? await api.put(`/admin/compounds/${initial.id}`, payload) : await api.post('/admin/compounds', payload);
      toast.success(t('common.success')); onSaved?.(data); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('compounds.edit') : t('compounds.add')}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="compound-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="compound-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label={t('compounds.name')} required><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('compounds.code')} required hint={t('compounds.codeHint')}><Input required value={form.code} onChange={set('code')} className="uppercase" /></Field>
        <Field label={t('compounds.address')} className="sm:col-span-2"><Input value={form.address || ''} onChange={set('address')} /></Field>
        <Field label={t('compounds.contactPerson')}><Input value={form.contactPerson || ''} onChange={set('contactPerson')} /></Field>
        <Field label={t('compounds.contactMobile')}><Input value={form.contactMobile || ''} onChange={set('contactMobile')} dir="ltr" /></Field>
        <Field label={t('compounds.unitsCount')}><Input type="number" min="0" value={form.unitsCount} onChange={set('unitsCount')} /></Field>
        <Field label={t('common.notes')} className="sm:col-span-2"><Textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

export default function Compounds() {
  const { t, lang } = useI18n(); const { can, company } = useAuth(); const navigate = useNavigate();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/compounds', { search: q, status, page, pageSize: 20 });
  const columns = [
    { key: 'name', header: t('compounds.name'), render: (r) => <div><p className="font-medium text-slate-800">{r.name}</p><p className="text-xs text-slate-500 font-mono">{r.code}</p></div> },
    { key: 'contactPerson', header: t('compounds.contactPerson'), render: (r) => <div><p>{r.contactPerson || '—'}</p><p className="text-xs text-slate-500" dir="ltr">{r.contactMobile}</p></div> },
    { key: 'unitsCount', header: t('compounds.unitsCount'), render: (r) => <span>{r.registeredUnits} <span className="text-slate-400">/ {r.unitsCount}</span></span> },
    { key: 'registeredVehicles', header: t('nav.vehicles') },
    { key: 'activeSubscriptions', header: t('compounds.activeSubs') },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`common.${r.status}`)} /> },
    { key: 'actions', header: '', className: 'text-end', render: (r) => can('compounds.manage') && <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setModal(r); }}>{t('common.edit')}</button> },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('compounds.title')} actions={can('compounds.manage') && <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} />{t('compounds.add')}</button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-72" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40"><option value="">{t('common.all')}</option><option value="active">{t('common.active')}</option><option value="inactive">{t('common.inactive')}</option></Select>
      </div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/compounds/${r.id}`)} />
      {modal && <CompoundForm open onClose={() => setModal(null)} initial={modal.id ? modal : null} onSaved={reload} />}
    </div>
  );
}
