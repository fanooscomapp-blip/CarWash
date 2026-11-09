import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQuery, useDebounced, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate, todayISO } from '../lib/format.js';
import { BrandPicker, ColorPicker, GpsField, useGpsCapture, ColorDot, colorName, BodyTypePicker } from '../components/VehiclePickers.jsx';
import { PageHeader, DataTable, SearchInput, Select, Modal, Field, Input, Textarea, Spinner, useToast, AsyncSelect, StatusBadge } from '../components/ui.jsx';

export function VehicleForm({ open, onClose, initial, onSaved, defaultUnit }) {
  const { t } = useI18n(); const toast = useToast(); const catalog = useQuery('/admin/registration/catalog');
  const [unit, setUnit] = useState(initial ? { id: initial.unitId, unitNumber: initial.unitNumber, compoundName: initial.compoundName, ownerName: initial.ownerName } : defaultUnit || null);
  const [form, setForm] = useState({ plateNumber: initial?.plateNumber || '', brand: initial?.brand || '', model: initial?.model || '', color: initial?.color || 'white', vehicleType: initial?.vehicleType || 'sedan', registrationDate: initial?.registrationDate || todayISO(), parkingLocation: initial?.parkingLocation || '', gpsLat: initial?.gpsLat ?? null, gpsLng: initial?.gpsLng ?? null, notes: initial?.notes || '', status: initial?.status || 'active' });
  const [busy, setBusy] = useState(false); const [gpsBusy, setGpsBusy] = useState(false); const [error, setError] = useState(null);
  const fetchUnits = useCallback(async (q) => (await api.get('/admin/lookups/search', { params: { q, type: 'units' } })).data, []);
  const capture = useGpsCapture(toast, t);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (!unit) throw new Error(t('validation.required'));
      const payload = { ...form, unitId: unit.id, brand: form.brand || null, model: form.model || null, parkingLocation: form.parkingLocation || null };
      const { data } = initial?.id ? await api.put(`/admin/vehicles/${initial.id}`, payload) : await api.post('/admin/vehicles', payload);
      toast.success(t('common.success')); onSaved?.(data); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('vehicles.edit') : t('vehicles.add')} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="vehicle-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="vehicle-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label={`${t('common.unit')} / ${t('common.owner')}`} required className="sm:col-span-2">
          <AsyncSelect fetchOptions={fetchUnits} value={unit} onChange={setUnit} disabled={!!defaultUnit && !initial} placeholder={t('common.selectUnit')} renderOption={(u) => <span><b>{u.unitNumber}</b> · {u.compoundName} · {u.ownerName}</span>} />
        </Field>
        <Field label={t('vehicles.plate')} required><Input required dir="ltr" value={form.plateNumber} onChange={set('plateNumber')} className="uppercase font-semibold" placeholder="ABC 1234" /></Field>
        <Field label={t('vehicles.registrationDate')}><Input type="date" value={form.registrationDate || ''} onChange={set('registrationDate')} /></Field>
        <Field label={t('vehicles.brand')}><BrandPicker value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} brands={catalog.data?.brands || []} placeholder={t('register.brandPlaceholder')} /></Field>
        <Field label={t('vehicles.model')}><Input value={form.model} onChange={set('model')} placeholder="Corolla" /></Field>
        <Field label={t('register.bodyType')} className="sm:col-span-2">
          <BodyTypePicker value={form.vehicleType} onChange={(bt) => setForm({ ...form, vehicleType: bt })} types={catalog.data?.bodyTypes || []} t={t} />
        </Field>
        <Field label={t('vehicles.color')} className="sm:col-span-2"><ColorPicker value={form.color} onChange={(v) => setForm({ ...form, color: v })} colors={catalog.data?.colors || []} t={t} /></Field>
        <Field label={t('vehicles.parking')}><Input value={form.parkingLocation} onChange={set('parkingLocation')} placeholder={t('register.parkingPlaceholder')} /></Field>
        <Field label={t('register.gps')}><GpsField lat={form.gpsLat} lng={form.gpsLng} busy={gpsBusy} onCapture={() => capture((lat, lng) => setForm((f) => ({ ...f, gpsLat: lat, gpsLng: lng })), setGpsBusy)} onClear={() => setForm({ ...form, gpsLat: null, gpsLng: null })} /></Field>
        {initial?.id && <Field label={t('common.status')}><Select value={form.status} onChange={set('status')}><option value="active">{t('common.active')}</option><option value="inactive">{t('common.inactive')}</option></Select></Field>}
        <Field label={t('common.notes')} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

export default function Vehicles() {
  const { t, lang } = useI18n(); const { can } = useAuth(); const navigate = useNavigate(); const lookups = useLookups();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState(sp.get('search') || ''); const [page, setPage] = useState(1); const [modal, setModal] = useState(false);
  const filters = { compoundId: sp.get('compoundId') || '', subscriptionStatus: sp.get('subscriptionStatus') || '', vehicleType: sp.get('vehicleType') || '', status: sp.get('status') || '' };
  const setFilter = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); setPage(1); };
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/vehicles', { search: q, ...filters, page, pageSize: 20 });
  const columns = [
    { key: 'plateNumber', header: t('vehicles.plate'), render: (r) => <div><p className="font-semibold" dir="ltr">{r.plateNumber}</p><p className="text-xs text-slate-500 font-mono">{r.vehicleCode}</p></div> },
    { key: 'brand', header: t('vehicles.brand'), render: (r) => <div><p>{r.brand} {r.model}</p><p className="text-xs text-slate-500 flex items-center gap-1"><ColorDot color={r.color} />{colorName(t, r.color)} · {t(`vehicles.types.${r.vehicleType}`)}</p></div> },
    { key: 'unitNumber', header: t('common.unit'), render: (r) => <div><p>{r.unitNumber}</p><p className="text-xs text-slate-500">{r.compoundName}</p></div> },
    { key: 'ownerName', header: t('common.owner'), render: (r) => <div><p>{r.ownerName}</p><p className="text-xs text-slate-500" dir="ltr">{r.ownerMobile}</p></div> },
    { key: 'currentSubscriptionStatus', header: t('vehicles.currentSub'), render: (r) => <div><StatusBadge status={r.currentSubscriptionStatus} />{r.currentSubscriptionEnd && <p className="text-xs text-slate-500 mt-1">{r.currentSubscriptionPlan} · {t('vehicles.expires')} {fmtDate(r.currentSubscriptionEnd, lang)}</p>}</div> },
    { key: 'currentWashesRemaining', header: t('subs.washes'), render: (r) => r.currentSubscriptionId ? `${r.currentWashesRemaining} ${t('vehicles.washesLeft')}` : '—' },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`common.${r.status}`)} /> },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('vehicles.title')} actions={can('vehicles.manage') && <><button className="btn-secondary" onClick={() => setModal(true)}><Plus size={16} />{t('vehicles.add')}</button><button className="btn-primary" onClick={() => navigate('/register')}><Plus size={16} />{t('register.title')}</button></>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-72" />
        <Select value={filters.compoundId} onChange={(e) => setFilter('compoundId', e.target.value)} className="w-48"><option value="">{t('dashboard.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={filters.subscriptionStatus} onChange={(e) => setFilter('subscriptionStatus', e.target.value)} className="w-44"><option value="">{t('vehicles.subscriptionFilter')}: {t('common.all')}</option>{(lookups.data?.subscriptionStatuses || []).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}<option value="none">{t('status.none')}</option></Select>
        <Select value={filters.vehicleType} onChange={(e) => setFilter('vehicleType', e.target.value)} className="w-40"><option value="">{t('vehicles.type')}: {t('common.all')}</option>{(lookups.data?.vehicleTypes || []).map((v) => <option key={v} value={v}>{t(`vehicles.types.${v}`)}</option>)}</Select>
      </div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/vehicles/${r.id}`)} />
      {modal && <VehicleForm open onClose={() => setModal(false)} onSaved={reload} />}
    </div>
  );
}
