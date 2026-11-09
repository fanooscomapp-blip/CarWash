import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Car } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useQuery, useLookups } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, fmtMoney, todayISO, addDaysISO } from '../lib/format.js';
import WashDaysPicker from '../components/WashDaysPicker.jsx';
import { PageHeader, Field, Input, Select, Textarea, AsyncSelect, Spinner, useToast, DaysPicker, StatusBadge, Toggle } from '../components/ui.jsx';


export default function SubscriptionNew() {
  const { t, lang } = useI18n(); const { company } = useAuth(); const toast = useToast(); const navigate = useNavigate(); const [sp] = useSearchParams();
  const cur = company?.currency || 'EGP';
  const lookups = useLookups(); const plans = useQuery('/admin/plans', { active: 'true' });
  const [step, setStep] = useState(0);
  const [compoundId, setCompoundId] = useState('');
  const [unit, setUnit] = useState(null);
  const [unitDetail, setUnitDetail] = useState(null);
  const [vehicleIds, setVehicleIds] = useState(sp.get('vehicleId') ? [sp.get('vehicleId')] : []);
  const [form, setForm] = useState({ planId: '', startDate: todayISO(), discount: 0, paymentMethod: 'bank_transfer', paymentStatus: 'paid', notes: '', customize: false, durationDays: '', washesAllowed: '', allowedDays: null, frequencyPerWeek: '', price: '', washDays: null });
  const [quote, setQuote] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(null);

  // Preselect unit from ?unitId=
  useEffect(() => { const uid = sp.get('unitId'); if (uid && !unit) api.get(`/admin/units/${uid}`).then((r) => { setUnit({ id: r.data.id, unitNumber: r.data.unitNumber, compoundName: r.data.compoundName, ownerName: r.data.ownerName, ownerMobile: r.data.ownerMobile, compoundId: r.data.compoundId }); setCompoundId(r.data.compoundId); }); }, []); // eslint-disable-line
  useEffect(() => { if (unit) api.get(`/admin/units/${unit.id}`).then((r) => setUnitDetail(r.data)); else setUnitDetail(null); }, [unit]);
  const fetchUnits = useCallback(async (q) => (await api.get('/admin/lookups/search', { params: { q, type: 'units', compoundId } })).data, [compoundId]);
  const activeVehicles = (unitDetail?.vehicles || []).filter((v) => v.status === 'active');
  const selectedVehicles = activeVehicles.filter((v) => vehicleIds.includes(v.id));
  const plan = (plans.data || []).find((p) => p.id === form.planId);
  useEffect(() => {
    if (!form.planId || !unit) return setQuote(null);
    api.get(`/admin/plans/${form.planId}/quote`, { params: { compoundId: unit.compoundId, vehicleType: selectedVehicles[0]?.vehicleType } }).then((r) => setQuote(r.data)).catch(() => setQuote(null));
  }, [form.planId, unit, vehicleIds]); // eslint-disable-line

  const price = form.customize && form.price !== '' ? Number(form.price) : quote?.price ?? 0;
  const duration = form.customize && form.durationDays ? Number(form.durationDays) : quote?.durationDays ?? plan?.durationDays ?? 0;
  const washes = form.customize && form.washesAllowed ? Number(form.washesAllowed) : quote?.maxWashes ?? plan?.maxWashes ?? 0;
  const allowedDays = form.washDays || (form.customize && form.allowedDays ? form.allowedDays : quote?.allowedDays ?? plan?.allowedDays ?? []);
  const final = Math.max(0, price - Number(form.discount || 0));
  const eligiblePlans = (plans.data || []).filter((p) => vehicleIds.length <= 1 || p.scope !== 'per_vehicle');

  const steps = [t('subs.wizard.unit'), t('subs.wizard.vehicles'), t('subs.wizard.plan'), t('subs.wizard.payment'), t('subs.wizard.review')];
  const canNext = [!!unit, vehicleIds.length > 0, !!form.planId && (!plan || vehicleIds.length <= plan.maxVehicles), true, true][step];

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const payload = { unitId: unit.id, compoundId: unit.compoundId, vehicleIds, planId: form.planId, startDate: form.startDate, discount: Number(form.discount || 0), paymentMethod: form.paymentMethod, paymentStatus: form.paymentStatus, notes: form.notes || null };
      if (form.washDays) payload.allowedDays = form.washDays;
      if (form.customize) { if (form.durationDays) payload.durationDays = Number(form.durationDays); if (form.washesAllowed) payload.washesAllowed = Number(form.washesAllowed); if (form.allowedDays) payload.allowedDays = form.allowedDays; if (form.frequencyPerWeek) payload.frequencyPerWeek = Number(form.frequencyPerWeek); if (form.price !== '') payload.price = Number(form.price); }
      const { data } = await api.post('/admin/subscriptions', payload);
      toast.success(t('common.success')); navigate(`/subscriptions/${data.subscription.id}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fade-in max-w-4xl">
      <Link to="/subscriptions" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={14} className="rtl:rotate-180" />{t('nav.subscriptions')}</Link>
      <PageHeader title={t('subs.add')} />
      <ol className="flex items-center gap-2 mb-6 overflow-x-auto">{steps.map((s, i) => <li key={s} className="flex items-center gap-2 whitespace-nowrap"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-navy-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{i < step ? <Check size={13} /> : i + 1}</span><span className={`text-sm ${i === step ? 'font-semibold text-navy-900' : 'text-slate-500'}`}>{s}</span>{i < steps.length - 1 && <span className="w-6 h-px bg-slate-300 mx-1" />}</li>)}</ol>

      <div className="card p-6 min-h-[320px]">
        {step === 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('common.compound')}><Select value={compoundId} onChange={(e) => { setCompoundId(e.target.value); setUnit(null); setVehicleIds([]); }}><option value="">{t('common.all')}</option>{lookups.data?.activeCompounds.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={`${t('common.unit')} / ${t('common.owner')}`} required><AsyncSelect fetchOptions={fetchUnits} value={unit} onChange={(u) => { setUnit(u); setVehicleIds([]); }} placeholder={t('common.selectUnit')} renderOption={(u) => <span><b>{u.unitNumber}</b> · {u.compoundName} · {u.ownerName} <span className="text-xs text-slate-400" dir="ltr">{u.ownerMobile}</span></span>} /></Field>
            {unitDetail && <div className="sm:col-span-2 rounded-lg bg-slate-50 p-4 text-sm grid sm:grid-cols-4 gap-3"><div><p className="text-xs text-slate-500">{t('common.compound')}</p><p className="font-medium">{unitDetail.compoundName}</p></div><div><p className="text-xs text-slate-500">{t('units.unitNumber')}</p><p className="font-medium">{unitDetail.unitNumber}</p></div><div><p className="text-xs text-slate-500">{t('common.owner')}</p><p className="font-medium">{unitDetail.ownerName}</p></div><div><p className="text-xs text-slate-500">{t('common.mobile')}</p><p className="font-medium" dir="ltr">{unitDetail.ownerMobile}</p></div></div>}
          </div>
        )}
        {step === 1 && (
          <div>
            <p className="text-sm text-slate-600 mb-3">{t('subs.wizard.selectVehicles')}</p>
            {!activeVehicles.length ? <p className="text-sm text-orange-600">{t('subs.wizard.noVehicles')} <Link to={`/units/${unit.id}`} className="underline">{t('units.addVehicle')}</Link></p> : (
              <div className="grid sm:grid-cols-2 gap-3">{activeVehicles.map((v) => { const on = vehicleIds.includes(v.id); return (
                <button key={v.id} type="button" onClick={() => setVehicleIds(on ? vehicleIds.filter((x) => x !== v.id) : [...vehicleIds, v.id])} className={`flex items-center gap-3 rounded-lg border p-3 text-start transition-colors ${on ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <span className={`grid h-5 w-5 place-items-center rounded border ${on ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300'}`}>{on && <Check size={13} />}</span>
                  <Car size={18} className="text-slate-400" /><div className="flex-1"><p className="font-semibold" dir="ltr">{v.plateNumber}</p><p className="text-xs text-slate-500">{v.brand} {v.model} · {v.color} · {t(`vehicles.types.${v.vehicleType}`)}</p></div>
                </button>); })}</div>)}
          </div>
        )}
        {step === 2 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('common.plan')} required className="sm:col-span-2"><Select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value, washDays: null })}><option value="">{t('common.selectPlan')}</option>{eligiblePlans.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' && p.nameAr ? p.nameAr : p.name} — {fmtMoney(p.price, cur, lang)} · {p.durationDays} {t('common.days')} · {p.maxWashes} {t('subs.washes').toLowerCase()} · {t(`plans.scopes.${p.scope}`)}</option>)}</Select></Field>
            {plan && vehicleIds.length > plan.maxVehicles && <p className="sm:col-span-2 text-sm text-red-600">{t('plans.maxVehicles')}: {plan.maxVehicles}</p>}
            <Field label={t('subs.start')} required><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label={t('subs.discount')}><Input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
            {quote && <div className="sm:col-span-2 rounded-lg bg-slate-50 p-4 text-sm grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><p className="text-xs text-slate-500">{t('subs.wizard.quote')}</p><p className="font-semibold">{fmtMoney(price, cur, lang)}</p>{quote.overrideApplied && <p className="text-[11px] text-brand-600">{t('subs.wizard.override')}</p>}</div>
              <div><p className="text-xs text-slate-500">{t('subs.duration')}</p><p className="font-semibold">{duration} {t('common.days')}</p></div>
              <div><p className="text-xs text-slate-500">{t('subs.washesAllowed')}</p><p className="font-semibold">{washes}</p></div>
              <div><p className="text-xs text-slate-500">{t('subs.end')}</p><p className="font-semibold">{fmtDate(addDaysISO(form.startDate, duration - 1), lang)}</p></div>
            </div>}
            {form.planId && <Field label={t('washDays.title')} hint={t('washDays.hint')} className="sm:col-span-2"><WashDaysPicker compoundId={unit.compoundId} planId={form.planId} perWeek={form.customize && form.frequencyPerWeek ? Number(form.frequencyPerWeek) : undefined} unitId={unit.id} value={form.washDays} onChange={(d) => setForm((f) => ({ ...f, washDays: d }))} /></Field>}
            <div className="sm:col-span-2"><Toggle checked={form.customize} onChange={(v) => setForm({ ...form, customize: v })} label={t('subs.wizard.customize')} /></div>
            {form.customize && <>
              <Field label={t('subs.price')}><Input type="number" min="0" step="0.01" placeholder={String(quote?.price ?? '')} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
              <Field label={t('subs.duration')}><Input type="number" min="1" placeholder={String(quote?.durationDays ?? '')} value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} /></Field>
              <Field label={t('subs.washesAllowed')}><Input type="number" min="1" placeholder={String(quote?.maxWashes ?? '')} value={form.washesAllowed} onChange={(e) => setForm({ ...form, washesAllowed: e.target.value })} /></Field>
              <Field label={t('subs.frequency')}><Input type="number" min="1" max="7" placeholder={String(quote?.maxFrequencyPerWeek ?? '')} value={form.frequencyPerWeek} onChange={(e) => setForm({ ...form, frequencyPerWeek: e.target.value })} /></Field>
            </>}
          </div>
        )}
        {step === 3 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('subs.paymentMethod')}><Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{(lookups.data?.paymentMethods || []).map((m) => <option key={m} value={m}>{t(`subs.methods.${m}`)}</option>)}</Select></Field>
            <Field label={t('subs.paymentStatus')}><Select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}><option value="paid">{t('subs.markPaid')}</option><option value="pending">{t('subs.markPending')}</option></Select></Field>
            <Field label={t('common.notes')} className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="sm:col-span-2 rounded-lg border border-slate-200 p-4 text-sm"><div className="flex justify-between"><span>{t('subs.price')}</span><span>{fmtMoney(price, cur, lang)}</span></div><div className="flex justify-between text-slate-500"><span>{t('subs.discount')}</span><span>−{fmtMoney(form.discount || 0, cur, lang)}</span></div><div className="flex justify-between font-semibold text-navy-900 text-lg mt-2 pt-2 border-t"><span>{t('subs.finalAmount')}</span><span>{fmtMoney(final, cur, lang)}</span></div></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4 text-sm">
            <p className="font-semibold text-navy-900">{t('subs.wizard.summary')}</p>
            <dl className="grid sm:grid-cols-3 gap-4">
              <div><dt className="text-xs text-slate-500">{t('common.owner')}</dt><dd className="font-medium">{unit.ownerName}</dd></div><div><dt className="text-xs text-slate-500">{t('common.unit')}</dt><dd className="font-medium">{unit.unitNumber} · {unit.compoundName}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('common.vehicles')}</dt><dd className="font-medium" dir="ltr">{selectedVehicles.map((v) => v.plateNumber).join(', ')}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('common.plan')}</dt><dd className="font-medium">{plan?.name}</dd></div><div><dt className="text-xs text-slate-500">{t('subs.period')}</dt><dd className="font-medium">{fmtDate(form.startDate, lang)} → {fmtDate(addDaysISO(form.startDate, duration - 1), lang)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('subs.washesAllowed')}</dt><dd className="font-medium">{washes} · {t('subs.allowedDays')}: {allowedDays.map((d) => t('common.weekdays')[d]).join(' ')}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('subs.finalAmount')}</dt><dd className="font-semibold text-lg text-navy-900">{fmtMoney(final, cur, lang)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('subs.paymentMethod')}</dt><dd className="font-medium">{t(`subs.methods.${form.paymentMethod}`)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t('subs.paymentStatus')}</dt><dd><StatusBadge status={form.paymentStatus === 'paid' ? 'paid' : 'pending_payment'} /></dd></div>
            </dl>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>
      <div className="flex justify-between mt-4">
        <button className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('common.previous')}</button>
        {step < 4 ? <button className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('common.next')}</button>
          : <button className="btn-accent" disabled={busy} onClick={submit}>{busy && <Spinner />}{form.paymentStatus === 'paid' ? t('subs.wizard.createAndActivate') : t('subs.wizard.createPending')}</button>}
      </div>
    </div>
  );
}
