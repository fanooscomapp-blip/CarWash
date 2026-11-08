import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtMoney } from '../lib/format.js';
import { PageHeader, Loading, ErrorBox, Modal, Field, Input, Select, Textarea, Spinner, useToast, DaysPicker, Toggle, StatusBadge, Empty } from '../components/ui.jsx';

const DEFAULT_DURATION = { weekly: 7, monthly: 30, quarterly: 90, semi_annual: 180, annual: 365, custom: 30 };

function PlanForm({ open, onClose, initial, onSaved }) {
  const { t } = useI18n(); const toast = useToast(); const lookups = useLookups();
  const [form, setForm] = useState(initial ? { ...initial, price: Number(initial.price), prices: (initial.prices || []).map((p) => ({ compoundId: p.compoundId || '', vehicleType: p.vehicleType || '', price: Number(p.price) })) }
    : { name: '', nameAr: '', planType: 'monthly', durationDays: 30, price: '', allowedDays: [0, 1, 2, 3, 4, 5, 6], maxFrequencyPerWeek: 3, maxWashes: 12, scope: 'per_vehicle', maxVehicles: 1, description: '', isActive: true, prices: [] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setType = (e) => setForm({ ...form, planType: e.target.value, durationDays: DEFAULT_DURATION[e.target.value] });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = { name: form.name, nameAr: form.nameAr || null, planType: form.planType, durationDays: Number(form.durationDays), price: Number(form.price), allowedDays: form.allowedDays, maxFrequencyPerWeek: Number(form.maxFrequencyPerWeek), maxWashes: Number(form.maxWashes), scope: form.scope, maxVehicles: form.scope === 'per_vehicle' ? 1 : Number(form.maxVehicles || 1), description: form.description || null, isActive: form.isActive, prices: form.prices.filter((p) => p.price !== '').map((p) => ({ compoundId: p.compoundId || null, vehicleType: p.vehicleType || null, price: Number(p.price) })) };
      const { data } = initial?.id ? await api.put(`/admin/plans/${initial.id}`, payload) : await api.post('/admin/plans', payload);
      toast.success(t('common.success')); onSaved?.(data); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('plans.edit') : t('plans.add')} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="plan-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="plan-form" onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label={t('plans.name')} required><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('plans.nameAr')}><Input dir="rtl" value={form.nameAr || ''} onChange={set('nameAr')} /></Field>
        <Field label={t('plans.type')}><Select value={form.planType} onChange={setType}>{Object.keys(DEFAULT_DURATION).map((k) => <option key={k} value={k}>{t(`plans.types.${k}`)}</option>)}</Select></Field>
        <Field label={t('plans.duration')} required><Input type="number" min="1" required value={form.durationDays} onChange={set('durationDays')} /></Field>
        <Field label={t('plans.price')} required><Input type="number" min="0" step="0.01" required value={form.price} onChange={set('price')} /></Field>
        <Field label={t('plans.maxWashes')} required><Input type="number" min="1" required value={form.maxWashes} onChange={set('maxWashes')} /></Field>
        <Field label={t('plans.frequency')} required><Input type="number" min="1" max="7" required value={form.maxFrequencyPerWeek} onChange={set('maxFrequencyPerWeek')} /></Field>
        <Field label={t('plans.scope')}><Select value={form.scope} onChange={set('scope')}>{['per_vehicle', 'per_unit', 'multi_vehicle'].map((s) => <option key={s} value={s}>{t(`plans.scopes.${s}`)}</option>)}</Select></Field>
        {form.scope !== 'per_vehicle' && <Field label={t('plans.maxVehicles')}><Input type="number" min="1" value={form.maxVehicles} onChange={set('maxVehicles')} /></Field>}
        <Field label={t('plans.allowedDays')} className="sm:col-span-2 lg:col-span-3"><DaysPicker value={form.allowedDays} onChange={(v) => setForm({ ...form, allowedDays: v })} /></Field>
        <Field label={t('plans.description')} className="sm:col-span-2 lg:col-span-3"><Textarea rows={2} value={form.description || ''} onChange={set('description')} /></Field>
        <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2"><p className="text-sm font-semibold">{t('plans.overrides')}</p><button type="button" className="btn-secondary btn-sm" onClick={() => setForm({ ...form, prices: [...form.prices, { compoundId: '', vehicleType: '', price: '' }] })}><Plus size={14} />{t('plans.addOverride')}</button></div>
          <p className="text-xs text-slate-500 mb-3">{t('plans.overrideHint')}</p>
          {form.prices.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_120px_32px] gap-2 mb-2">
              <Select value={p.compoundId} onChange={(e) => setForm({ ...form, prices: form.prices.map((x, j) => (j === i ? { ...x, compoundId: e.target.value } : x)) })}><option value="">{t('plans.anyCompound')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select value={p.vehicleType} onChange={(e) => setForm({ ...form, prices: form.prices.map((x, j) => (j === i ? { ...x, vehicleType: e.target.value } : x)) })}><option value="">{t('plans.anyType')}</option>{lookups.data?.vehicleTypes.map((v) => <option key={v} value={v}>{t(`vehicles.types.${v}`)}</option>)}</Select>
              <Input type="number" min="0" step="0.01" value={p.price} onChange={(e) => setForm({ ...form, prices: form.prices.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
              <button type="button" className="btn-ghost p-1.5 text-red-500" onClick={() => setForm({ ...form, prices: form.prices.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="sm:col-span-2 lg:col-span-3"><Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} /><p className="text-xs text-slate-500 mt-1">{t('plans.inactiveHint')}</p></div>
        {error && <p className="sm:col-span-2 lg:col-span-3 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

export default function Plans() {
  const { t, lang } = useI18n(); const { can, company } = useAuth();
  const { data, loading, error, reload } = useQuery('/admin/plans');
  const [modal, setModal] = useState(null);
  const cur = company?.currency || 'EGP'; const days = t('common.weekdays');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="fade-in">
      <PageHeader title={t('plans.title')} actions={can('plans.manage') && <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} />{t('plans.add')}</button>} />
      {loading && !data ? <Loading /> : !data.length ? <div className="card"><Empty /></div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map((p) => (
            <div key={p.id} className={`card p-5 flex flex-col ${p.isActive ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold text-navy-900">{lang === 'ar' && p.nameAr ? p.nameAr : p.name}</p><p className="text-xs text-slate-500">{t(`plans.types.${p.planType}`)} · {p.durationDays} {t('common.days')} · {t(`plans.scopes.${p.scope}`)}{p.scope !== 'per_vehicle' ? ` (${p.maxVehicles})` : ''}</p></div>
                <StatusBadge status={p.isActive ? 'active' : 'inactive'} label={p.isActive ? t('common.active') : t('common.inactive')} />
              </div>
              <p className="mt-3 text-2xl font-semibold text-navy-900">{fmtMoney(p.price, cur, lang)}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div><dt className="text-slate-400">{t('plans.maxWashes')}</dt><dd className="font-medium">{p.maxWashes}</dd></div>
                <div><dt className="text-slate-400">{t('plans.frequency')}</dt><dd className="font-medium">{p.maxFrequencyPerWeek}</dd></div>
                <div className="col-span-2"><dt className="text-slate-400">{t('plans.allowedDays')}</dt><dd className="flex flex-wrap gap-1 mt-1">{[6, 0, 1, 2, 3, 4, 5].map((d) => <span key={d} className={`rounded px-1.5 py-0.5 text-[10px] ${p.allowedDays.includes(d) ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-400'}`}>{days[d]}</span>)}</dd></div>
              </dl>
              {p.prices?.length > 0 && <div className="mt-3 text-xs"><p className="text-slate-400 mb-1">{t('plans.overrides')}</p><ul className="space-y-0.5">{p.prices.map((o) => <li key={o.id} className="flex justify-between"><span className="text-slate-600">{o.compound?.name || t('plans.anyCompound')} · {o.vehicleType ? t(`vehicles.types.${o.vehicleType}`) : t('plans.anyType')}</span><span className="font-medium">{fmtMoney(o.price, cur, lang)}</span></li>)}</ul></div>}
              <div className="mt-auto pt-4 flex items-center justify-between text-xs text-slate-500"><span>{t('plans.usage', { active: p.usage.active, total: p.usage.total })}</span>{can('plans.manage') && <button className="btn-ghost btn-sm" onClick={() => setModal(p)}><Pencil size={14} />{t('common.edit')}</button>}</div>
            </div>
          ))}
        </div>
      )}
      {modal && <PlanForm open onClose={() => setModal(null)} initial={modal.id ? modal : null} onSaved={reload} />}
    </div>
  );
}
