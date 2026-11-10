import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQuery, useDebounced, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { PageHeader, DataTable, SearchInput, Select, Modal, Field, Input, Textarea, Spinner, useToast, DeleteButton } from '../components/ui.jsx';

export function OwnerForm({ open, onClose, initial, onSaved }) {
  const { t } = useI18n(); const toast = useToast();
  const [form, setForm] = useState({ name: initial?.name || '', mobile: initial?.mobile || '', altMobile: initial?.altMobile || '', email: initial?.email || '', notes: initial?.notes || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const { data } = initial?.id ? await api.put(`/admin/owners/${initial.id}`, form) : await api.post('/admin/owners', form); toast.success(t('common.success')); onSaved?.(data); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('owners.edit') : t('owners.add')} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="owner-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="owner-form" onSubmit={submit} className="space-y-4">
        <Field label={t('common.name')} required><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('common.mobile')} required><Input required dir="ltr" value={form.mobile} onChange={set('mobile')} /></Field>
        <Field label={t('units.altMobile')}><Input dir="ltr" value={form.altMobile} onChange={set('altMobile')} /></Field>
        <Field label={t('common.email')}><Input type="email" dir="ltr" value={form.email} onChange={set('email')} /></Field>
        <Field label={t('common.notes')}><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

export default function Owners() {
  const { t } = useI18n(); const { can } = useAuth(); const navigate = useNavigate(); const lookups = useLookups();
  const [search, setSearch] = useState(''); const [compoundId, setCompoundId] = useState(''); const [page, setPage] = useState(1); const [modal, setModal] = useState(false);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/owners', { search: q, compoundId, page, pageSize: 20 });
  const columns = [
    { key: 'name', header: t('common.name'), render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'mobile', header: t('common.mobile'), render: (r) => <div dir="ltr" className="text-start"><p>{r.mobile}</p>{r.altMobile && <p className="text-xs text-slate-500">{r.altMobile}</p>}</div> },
    { key: 'email', header: t('common.email') },
    { key: 'compoundNames', header: t('owners.compounds') },
    { key: 'unitsCount', header: t('owners.units') }, { key: 'vehiclesCount', header: t('owners.vehicles') }, { key: 'activeSubscriptions', header: t('owners.activeSubs') },
    { key: 'actions', header: '', className: 'text-end', render: (r) => can('owners.manage') && <DeleteButton url={`/admin/owners/${r.id}`} name={r.name} onDone={reload} /> },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('owners.title')} actions={can('owners.manage') && <button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} />{t('owners.add')}</button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-72" />
        <Select value={compoundId} onChange={(e) => { setCompoundId(e.target.value); setPage(1); }} className="w-52"><option value="">{t('dashboard.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/owners/${r.id}`)} />
      {modal && <OwnerForm open onClose={() => setModal(false)} onSaved={reload} />}
    </div>
  );
}
