import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useQuery } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, fmtMoney, todayISO, addDaysISO } from '../lib/format.js';
import { Modal, Field, Input, Select, Spinner, useToast, StatusBadge, Textarea } from './ui.jsx';


// Quick renewal: pick plan → start date → review price/discount → paid or pending. Used from lists, detail pages, and the renewals screen.
export default function RenewModal({ open, onClose, subscription, onRenewed }) {
  const { t, lang } = useI18n(); const { company } = useAuth(); const toast = useToast();
  const cur = company?.currency || 'EGP';
  const plans = useQuery('/admin/plans', { active: 'true' });
  const defaultStart = subscription.endDate >= todayISO() ? addDaysISO(subscription.endDate, 1) : todayISO();
  const [form, setForm] = useState({ planId: subscription.planId, startDate: defaultStart, discount: 0, paymentMethod: subscription.paymentMethod || 'bank_transfer', paymentStatus: 'paid', notes: '' });
  const [quote, setQuote] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  useEffect(() => {
    if (!form.planId) return;
    api.get(`/admin/plans/${form.planId}/quote`, { params: { compoundId: subscription.compoundId } }).then((r) => setQuote(r.data)).catch(() => setQuote(null));
  }, [form.planId, subscription.compoundId]);
  const price = quote?.price ?? 0; const final = Math.max(0, price - Number(form.discount || 0));
  const submit = async () => {
    setBusy(true); setError(null);
    try { const { data } = await api.post(`/admin/subscriptions/${subscription.id}/renew`, { ...form, discount: Number(form.discount || 0) }); toast.success(t('renewals.renewed_ok')); onRenewed?.(data); onClose(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('renewals.renewTitle')} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-accent" disabled={busy || !form.planId} onClick={submit}>{busy && <Spinner />}{form.paymentStatus === 'paid' ? t('subs.wizard.createAndActivate') : t('subs.wizard.createPending')}</button></>}>
      <div className="rounded-lg bg-slate-50 p-3 text-sm mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold" dir="ltr">{subscription.plates}</p><p className="text-slate-500 text-xs">{subscription.ownerName} · {t('common.unit')} {subscription.unitNumber} · {subscription.compoundName}</p></div>
        <div className="text-end"><StatusBadge status={subscription.status} /><p className="text-xs text-slate-500 mt-1">{subscription.planName} · {t('renewals.expiry')} {fmtDate(subscription.endDate, lang)}</p></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t('renewals.newPlan')} required className="sm:col-span-2">
          <Select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>{(plans.data || []).filter((p) => p.scope !== 'per_vehicle' || (subscription.vehicleIds?.length || 1) <= 1).map((p) => <option key={p.id} value={p.id}>{lang === 'ar' && p.nameAr ? p.nameAr : p.name} — {fmtMoney(p.price, cur, lang)} · {p.durationDays} {t('common.days')} · {p.maxWashes} {t('subs.washes').toLowerCase()}</option>)}</Select>
        </Field>
        <Field label={t('renewals.newStart')} hint={t('renewals.startHint')}><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label={t('subs.discount')}><Input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
        <Field label={t('subs.paymentMethod')}><Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{['bank_transfer', 'cash', 'other'].map((m) => <option key={m} value={m}>{t(`subs.methods.${m}`)}</option>)}</Select></Field>
        <Field label={t('subs.paymentStatus')}><Select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}><option value="paid">{t('subs.markPaid')}</option><option value="pending">{t('subs.markPending')}</option></Select></Field>
        <Field label={t('common.notes')} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 p-4 text-sm grid grid-cols-3 gap-3">
        <div><p className="text-xs text-slate-500">{t('subs.wizard.quote')}</p><p className="font-semibold">{fmtMoney(price, cur, lang)}</p>{quote?.overrideApplied && <p className="text-[11px] text-brand-600">{t('subs.wizard.override')}</p>}</div>
        <div><p className="text-xs text-slate-500">{t('subs.discount')}</p><p className="font-semibold">−{fmtMoney(form.discount || 0, cur, lang)}</p></div>
        <div><p className="text-xs text-slate-500">{t('subs.finalAmount')}</p><p className="font-semibold text-navy-900 text-lg">{fmtMoney(final, cur, lang)}</p></div>
        {quote && <p className="col-span-3 text-xs text-slate-500">{t('subs.period')}: {fmtDate(form.startDate, lang)} → {fmtDate(addDaysISO(form.startDate, quote.durationDays - 1), lang)} · {quote.maxWashes} {t('subs.washes').toLowerCase()}</p>}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
