import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Pause, Play, XCircle, CheckCircle2, Ban, Link2, MessageSquare, Copy } from 'lucide-react';
import { useQuery } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format.js';
import { PageHeader, Loading, ErrorBox, DescriptionList, StatusBadge, ConfirmDialog, useToast, KpiCard, Modal, Spinner, DeleteButton } from '../components/ui.jsx';
import RenewModal from '../components/RenewModal.jsx';
import WashDaysPicker from '../components/WashDaysPicker.jsx';

export default function SubscriptionDetail() {
  const { id } = useParams(); const { t, lang } = useI18n(); const { can, company } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const { data: s, loading, error, reload } = useQuery(`/admin/subscriptions/${id}`);
  const [renew, setRenew] = useState(false); const [dialog, setDialog] = useState(null); const [busy, setBusy] = useState(false);
  const [editDays, setEditDays] = useState(false); const [daysDraft, setDaysDraft] = useState(null); const [daysBusy, setDaysBusy] = useState(false);
  const [link, setLink] = useState(null); const [linkBusy, setLinkBusy] = useState(false);
  const getLink = async () => { setLinkBusy(true); try { const { data } = await api.get(`/admin/sms/renewal-link/${id}`); setLink(data.link); try { await navigator.clipboard.writeText(data.link); toast.success(t('common.copied')); } catch { /* clipboard blocked */ } } catch (e) { toast.error(e.message); } finally { setLinkBusy(false); } };
  // Opens WhatsApp with the Arabic renewal text + link prefilled (owner's number); nothing is sent until the admin taps send in WhatsApp
  const sendWhatsApp = async () => {
    setLinkBusy(true);
    try {
      const { data } = await api.get(`/admin/sms/renewal-link/${id}`); setLink(data.link);
      const msg = lang === 'ar'
        ? `مرحباً ${s.ownerName}، اشتراك غسيل السيارة ${s.plates} (وحدة ${s.unitNumber} - ${s.compoundName}) ينتهي بتاريخ ${fmtDate(s.endDate, 'en')}. للتجديد ورفع إيصال التحويل: ${data.link}`
        : `Hello ${s.ownerName}, your car wash subscription for ${s.plates} (unit ${s.unitNumber} - ${s.compoundName}) expires on ${fmtDate(s.endDate, 'en')}. Renew and upload your transfer receipt here: ${data.link}`;
      window.open(`https://wa.me/${s.ownerMobile.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } catch (e) { toast.error(e.message); } finally { setLinkBusy(false); }
  };
  const sendReminder = async () => { setBusy(true); try { const { data } = await api.post(`/admin/sms/renewal-reminder/${id}`); setLink(data.link); toast[data.log?.status === 'sent' ? 'success' : 'error'](t(`sms.status_${data.log?.status || 'failed'}`)); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const cur = company?.currency || 'EGP'; const days = t('common.weekdays');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !s) return <Loading />;
  const act = async (fn, okMsg) => { setBusy(true); try { await fn(); toast.success(okMsg || t('common.success')); setDialog(null); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const pendingPayment = s.payments.find((p) => ['pending_verification', 'awaiting_new_receipt'].includes(p.status));
  const canRenew = ['active', 'expiring_soon', 'expired'].includes(s.status) && !s.renewedToId;
  return (
    <div className="fade-in">
      <Link to="/subscriptions" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={14} className="rtl:rotate-180" />{t('nav.subscriptions')}</Link>
      <PageHeader title={<span className="flex items-center gap-3 flex-wrap"><span className="font-mono">{s.subscriptionCode}</span><StatusBadge status={s.status} /></span>} subtitle={`${lang === 'ar' && s.planNameAr ? s.planNameAr : s.planName} · ${s.ownerName} · ${t('common.unit')} ${s.unitNumber} · ${s.compoundName}`}
        actions={<>
          {can('payments.approve') && pendingPayment && <><button className="btn-success" onClick={() => setDialog('approve')}><CheckCircle2 size={16} />{t('subs.approvePayment')}</button><button className="btn-secondary" onClick={() => setDialog('reject')}><Ban size={16} />{t('subs.rejectPayment')}</button></>}
          {can('subscriptions.renew', 'subscriptions.manage') && canRenew && <button className="btn-accent" onClick={() => setRenew(true)}><RefreshCw size={16} />{t('vehicles.renew')}</button>}
          {can('sms.send', 'subscriptions.renew') && canRenew && <button className="btn-secondary" disabled={busy} onClick={sendReminder}><MessageSquare size={16} />{t('sms.sendReminder')}</button>}
          {can('subscriptions.view') && canRenew && <button className="btn-secondary !bg-emerald-600 !text-white !border-emerald-600 hover:!bg-emerald-700" disabled={linkBusy} onClick={sendWhatsApp}><MessageSquare size={16} />{t('sms.sendWhatsApp')}</button>}
          {can('subscriptions.view') && canRenew && <button className="btn-secondary" disabled={linkBusy} onClick={getLink}><Link2 size={16} />{t('sms.copyLink')}</button>}
          {can('subscriptions.manage') && ['active', 'expiring_soon'].includes(s.status) && <button className="btn-secondary" onClick={() => setDialog('suspend')}><Pause size={16} />{t('subs.suspend')}</button>}
          {can('subscriptions.manage') && s.status === 'suspended' && <button className="btn-success" onClick={() => act(() => api.post(`/admin/subscriptions/${id}/resume`, {}))}><Play size={16} />{t('subs.resume')}</button>}
          {can('subscriptions.manage') && ['cancelled', 'pending_payment'].includes(s.status) && <DeleteButton url={`/admin/subscriptions/${s.id}`} name={s.subscriptionCode} iconOnly={false} className="!border !border-red-200" onDone={() => navigate('/subscriptions')} />}
          {can('subscriptions.manage') && !['cancelled', 'expired'].includes(s.status) && <button className="btn-danger" onClick={() => setDialog('cancel')}><XCircle size={16} />{t('subs.cancel')}</button>}
        </>} />
      {link && <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm"><Link2 size={15} className="text-brand-600 shrink-0" /><a href={link} target="_blank" rel="noreferrer" className="flex-1 truncate text-brand-700 underline" dir="ltr">{link}</a><button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(link); toast.success(t('common.copied')); }}><Copy size={14} /></button><a className="btn-ghost btn-sm" href={`https://wa.me/${s.ownerMobile.replace(/\D/g, '')}?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label={t('subs.daysRemaining')} value={['active', 'expiring_soon'].includes(s.status) ? s.daysRemaining : '—'} tone={s.daysRemaining <= 7 ? 'warning' : 'default'} hint={`${fmtDate(s.startDate, lang)} → ${fmtDate(s.endDate, lang)}`} />
        <KpiCard label={t('subs.washes')} value={`${s.washesUsed} / ${s.washesAllowed}`} hint={`${s.washesAllowed - s.washesUsed} ${t('common.remaining')}`} />
        <KpiCard label={t('subs.finalAmount')} value={fmtMoney(s.finalAmount, cur, lang)} hint={Number(s.discount) ? `${t('subs.discount')}: ${fmtMoney(s.discount, cur, lang)}` : undefined} tone="success" />
        <KpiCard label={t('subs.paymentStatus')} value={<StatusBadge status={s.paymentStatus === 'paid' ? 'paid' : s.paymentStatus === 'rejected' ? 'rejected' : 'pending'} />} hint={t(`subs.methods.${s.paymentMethod}`)} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <DescriptionList cols={3} items={[
              [t('common.plan'), s.planName], [t('subs.duration'), `${s.durationDays} ${t('common.days')}`], [t('subs.frequency'), s.frequencyPerWeek],
              [t('subs.allowedDays'), <span className="flex flex-wrap items-center gap-1">{[6, 0, 1, 2, 3, 4, 5].map((d) => <span key={d} className={`rounded px-1.5 py-0.5 text-[10px] ${s.allowedDays.includes(d) ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-400'}`}>{days[d]}</span>)}{can('subscriptions.manage') && s.status !== 'cancelled' && <button className="text-[11px] text-brand-600 hover:underline ms-1" onClick={() => { setDaysDraft(s.allowedDays); setEditDays(true); }}>{t('common.edit')}</button>}</span>],
              [t('common.owner'), <Link className="text-brand-600 hover:underline" to={`/owners/${s.ownerId}`}>{s.ownerName} <span dir="ltr" className="text-xs text-slate-500">{s.ownerMobile}</span></Link>], [t('common.unit'), <Link className="text-brand-600 hover:underline" to={`/units/${s.unitId}`}>{s.unitNumber} · {s.compoundName}</Link>],
              s.renewedFromId && [t('subs.renewedFrom'), <Link className="text-brand-600 hover:underline" to={`/subscriptions/${s.renewedFromId}`}>{s.history.find((h) => h.id === s.renewedFromId)?.subscription_code}</Link>],
              s.renewedToId && [t('subs.renewedTo'), <Link className="text-brand-600 hover:underline" to={`/subscriptions/${s.renewedToId}`}>{s.history.find((h) => h.id === s.renewedToId)?.subscription_code} <StatusBadge status={s.renewedToStatus} /></Link>],
              s.statusReason && [t('common.reason'), s.statusReason], [t('common.notes'), s.notes], [t('common.createdAt'), fmtDateTime(s.createdAt, lang)],
            ]} />
          </div>
          <div className="card overflow-hidden"><p className="px-5 py-3 text-sm font-semibold border-b border-slate-200">{t('subs.vehicles')}</p>
            <ul className="divide-y divide-slate-100">{s.vehicles.map((v) => <li key={v.id} className="px-5 py-3 flex items-center justify-between text-sm"><div><Link to={`/vehicles/${v.id}`} className="font-semibold text-brand-600 hover:underline" dir="ltr">{v.plateNumber}</Link><p className="text-xs text-slate-500">{v.brand} {v.model} · {v.color} · {v.vehicleCode}</p></div><StatusBadge status={v.status} label={t(`common.${v.status}`)} /></li>)}</ul></div>
          <div className="card overflow-hidden"><p className="px-5 py-3 text-sm font-semibold border-b border-slate-200">{t('subs.payments')}</p>
            <table className="table"><thead><tr><th>{t('payments.code')}</th><th>{t('common.amount')}</th><th>{t('payments.method')}</th><th>{t('common.date')}</th><th>{t('payments.receipts')}</th><th>{t('common.status')}</th></tr></thead>
              <tbody>{s.payments.map((p) => <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/payments?search=${p.paymentCode}`)}><td className="font-mono text-xs">{p.paymentCode}</td><td>{fmtMoney(p.amount, cur, lang)}</td><td>{t(`subs.methods.${p.method}`)}</td><td>{fmtDate(p.paymentDate || p.createdAt, lang)}</td><td>{p.receipts?.length || 0}</td><td><StatusBadge status={p.status} />{p.rejectionReason && <p className="text-xs text-red-600 mt-1">{p.rejectionReason}</p>}</td></tr>)}</tbody></table></div>
        </div>
        <div className="card p-5"><p className="text-sm font-semibold mb-3">{t('subs.history')}</p>
          <ol className="relative border-s border-slate-200 ms-2 space-y-4">{s.history.map((h) => (
            <li key={h.id} className="ms-4"><span className={`absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white ${h.id === s.id ? 'bg-brand-600' : 'bg-slate-300'}`} />
              <Link to={`/subscriptions/${h.id}`} className={`text-sm font-mono ${h.id === s.id ? 'font-semibold text-navy-900' : 'text-brand-600 hover:underline'}`}>{h.subscription_code}</Link>
              <p className="text-xs text-slate-500">{h.plan_name} · {fmtDate(h.start_date, lang)} → {fmtDate(h.end_date, lang)}</p><div className="mt-1 flex items-center gap-2"><StatusBadge status={h.status} /><span className="text-xs text-slate-500">{fmtMoney(h.final_amount, cur, lang)}</span></div></li>))}</ol>
        </div>
      </div>
      <Modal open={editDays} onClose={() => setEditDays(false)} title={t('washDays.editTitle')} footer={<><button className="btn-secondary" onClick={() => setEditDays(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={daysBusy} onClick={async () => { setDaysBusy(true); try { await api.put(`/admin/subscriptions/${s.id}/days`, { allowedDays: daysDraft }); toast.success(t('common.success')); setEditDays(false); reload(); } catch (e) { toast.error(e.message); } finally { setDaysBusy(false); } }}>{daysBusy && <Spinner />}{t('common.save')}</button></>}>
        <p className="text-sm text-slate-600 mb-3">{t('washDays.editHint')}</p>
        {editDays && <WashDaysPicker compoundId={s.compoundId} planId={s.planId} perWeek={s.frequencyPerWeek} unitId={s.unitId} excludeSubscriptionId={s.id} value={daysDraft} onChange={(d) => setDaysDraft(d)} />}
      </Modal>
      {renew && <RenewModal open onClose={() => setRenew(false)} subscription={s} onRenewed={(r) => navigate(`/subscriptions/${r.subscription.id}`)} />}
      <ConfirmDialog open={dialog === 'approve'} onClose={() => setDialog(null)} loading={busy} title={t('subs.approvePayment')} message={t('payments.approveConfirm')} confirmLabel={t('payments.approve')} onConfirm={() => act(() => api.post(`/admin/payments/${pendingPayment.id}/approve`, {}), t('payments.approved_ok'))} />
      <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} loading={busy} danger title={t('subs.rejectPayment')} reasonLabel={t('subs.rejectReason')} confirmLabel={t('payments.reject')} onConfirm={(reason) => act(() => api.post(`/admin/payments/${pendingPayment.id}/reject`, { reason }))} />
      <ConfirmDialog open={dialog === 'suspend'} onClose={() => setDialog(null)} loading={busy} title={t('subs.suspend')} reasonLabel={t('subs.suspendReason')} onConfirm={(reason) => act(() => api.post(`/admin/subscriptions/${id}/suspend`, { reason }))} />
      <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} loading={busy} danger title={t('subs.cancel')} message={t('subs.cancelConfirm')} reasonLabel={t('subs.cancelReason')} onConfirm={(reason) => act(() => api.post(`/admin/subscriptions/${id}/cancel`, { reason }))} />
    </div>
  );
}
