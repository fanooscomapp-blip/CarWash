import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQuery, useDebounced, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { PageHeader, DataTable, SearchInput, Select, Modal, Field, Input, Textarea, Spinner, useToast, AsyncSelect } from '../components/ui.jsx';

export function UnitForm({ open, onClose, initial, onSaved, defaultCompoundId }) {
  const { t } = useI18n(); const toast = useToast(); const lookups = useLookups();
  const [form, setForm] = useState({ compoundId: initial?.compoundId || defaultCompoundId || '', unitNumber: initial?.unitNumber || '', notes: initial?.notes || '', ownerMode: initial ? 'existing' : 'new', ownerId: initial?.ownerId || null, owner: { name: '', mobile: '', altMobile: '', email: '' } });
  const [ownerObj, setOwnerObj] = useState(initial ? { id: initial.ownerId, name: initial.ownerName, mobile: initial.ownerMobile } : null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const fetchOwners = useCallback(async (q) => (await api.get('/admin/lookups/search', { params: { q, type: 'owners' } })).data, []);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = { compoundId: form.compoundId, unitNumber: form.unitNumber, notes: form.notes || null };
      if (form.ownerMode === 'existing') { if (!ownerObj) throw new Error(t('validation.required')); payload.ownerId = ownerObj.id; } else payload.owner = form.owner;
      const { data } = initial?.id ? await api.put(`/admin/units/${initial.id}`, payload) : await api.post('/admin/units', payload);
      toast.success(t('common.success')); onSaved?.(data); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('units.edit') : t('units.add')}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="unit-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="unit-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label={t('common.compound')} required><Select required value={form.compoundId} onChange={(e) => setForm({ ...form, compoundId: e.target.value })}><option value="">{t('common.selectCompound')}</option>{lookups.data?.compounds.filter((c) => c.status === 'active' || c.id === form.compoundId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={t('units.unitNumber')} required><Input required value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} /></Field>
        <div className="sm:col-span-2 rounded-lg border border-slate-200 p-4 space-y-4">
          <div className="flex gap-2">{['existing', 'new'].map((m) => <button type="button" key={m} onClick={() => setForm({ ...form, ownerMode: m })} className={`btn btn-sm ${form.ownerMode === m ? 'bg-navy-900 text-white' : 'btn-secondary'}`}>{t(`units.${m}Owner`)}</button>)}</div>
          {form.ownerMode === 'existing' ? (
            <Field label={t('common.owner')} required><AsyncSelect fetchOptions={fetchOwners} value={ownerObj} onChange={setOwnerObj} placeholder={t('common.selectUnit')} renderOption={(o) => <span>{o.name} <span className="text-slate-400 text-xs" dir="ltr">{o.mobile}</span></span>} /></Field>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t('units.ownerName')} required><Input required value={form.owner.name} onChange={(e) => setForm({ ...form, owner: { ...form.owner, name: e.target.value } })} /></Field>
              <Field label={t('units.ownerMobile')} required><Input required dir="ltr" value={form.owner.mobile} onChange={(e) => setForm({ ...form, owner: { ...form.owner, mobile: e.target.value } })} placeholder="+2010…" /></Field>
              <Field label={t('units.altMobile')}><Input dir="ltr" value={form.owner.altMobile} onChange={(e) => setForm({ ...form, owner: { ...form.owner, altMobile: e.target.value } })} /></Field>
              <Field label={t('common.email')}><Input type="email" dir="ltr" value={form.owner.email} onChange={(e) => setForm({ ...form, owner: { ...form.owner, email: e.target.value } })} /></Field>
            </div>
          )}
        </div>
        <Field label={t('common.notes')} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

export default function Units() {
  const { t } = useI18n(); const { can } = useAuth(); const navigate = useNavigate(); const lookups = useLookups();
  const [search, setSearch] = useState(''); const [compoundId, setCompoundId] = useState(''); const [page, setPage] = useState(1); const [modal, setModal] = useState(false);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/units', { search: q, compoundId, page, pageSize: 20 });
  const columns = [
    { key: 'unitNumber', header: t('units.unitNumber'), render: (r) => <div><p className="font-medium">{r.unitNumber}</p><p className="text-xs text-slate-500">{r.compoundName}</p></div> },
    { key: 'ownerName', header: t('units.ownerName'), render: (r) => <div>{r.ownerName}<p className="text-xs text-slate-500" dir="ltr">{r.ownerMobile}</p></div> },
    { key: 'ownerEmail', header: t('common.email') },
    { key: 'vehiclesCount', header: t('units.vehicles') },
    { key: 'activeSubscriptions', header: t('compounds.activeSubs') },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('units.title')} actions={can('units.manage') && <><button className="btn-secondary" onClick={() => setModal(true)}><Plus size={16} />{t('units.add')}</button><button className="btn-primary" onClick={() => navigate('/register')}><Plus size={16} />{t('register.title')}</button></>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-80" placeholder={t('common.selectUnit')} />
        <Select value={compoundId} onChange={(e) => { setCompoundId(e.target.value); setPage(1); }} className="w-52"><option value="">{t('dashboard.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/units/${r.id}`)} />
      {modal && <UnitForm open onClose={() => setModal(false)} onSaved={reload} defaultCompoundId={compoundId} />}
    </div>
  );
}
