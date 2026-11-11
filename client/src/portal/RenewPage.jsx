import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Upload, Car, AlertTriangle, Clock, FileImage, LogIn } from 'lucide-react';
import { papi, usePortal, fmtDate, fmtMoney, Badge, ContactAdmin } from './portalLib.jsx';
import { PortalShell, Card, BigButton, Spinner, Center } from './PortalLayout.jsx';
import PaymentBox from './PaymentBox.jsx';
import BodyIcon from '../components/BodyIcons.jsx';

export default function RenewPage() {
  const { token } = useParams(); const { t, lang } = usePortal();
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const [planId, setPlanId] = useState(null); const [file, setFile] = useState(null); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null); const [submitErr, setSubmitErr] = useState(null);
  const fileRef = useRef();
  const load = () => papi.get(`/renew/${token}`).then((r) => { setData(r.data); setPlanId((p) => p || r.data.request?.planId || r.data.plans.find((x) => x.isCurrent)?.id || r.data.plans[0]?.id); }).catch((e) => setErr(e));
  useEffect(() => { load(); }, [token]); // eslint-disable-line
  const cur = data?.company?.currency || 'EGP';
  const plan = data?.plans.find((p) => p.id === planId);
  const pName = (p) => (lang === 'ar' && p?.planNameAr) ? p.planNameAr : (lang === 'ar' && p?.nameAr) ? p.nameAr : p?.planName || p?.name;
  const submit = async () => {
    setBusy(true); setSubmitErr(null);
    try { const fd = new FormData(); fd.append('planId', planId); if (note) fd.append('note', note); fd.append('receipt', file); const r = await papi.post(`/renew/${token}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); setDone(r.data); setFile(null); load(); }
    catch (e) { setSubmitErr(e.message); } finally { setBusy(false); }
  };

  if (err) return <PortalShell><Center><AlertTriangle size={40} className="text-orange-500" /><p className="font-semibold text-slate-800">{err.code === 'LINK_EXPIRED' ? t('linkExpired') : t('linkInvalid')}</p><Link to="/p/login" className="text-brand-600 underline text-sm flex items-center gap-1"><LogIn size={14} />{t('loginInstead')}</Link><ContactAdmin className="justify-center" /></Center></PortalShell>;
  if (!data) return <PortalShell><Center><Spinner /></Center></PortalShell>;
  const req = data.request;
  const canSubmit = !req || req.payment?.status === 'awaiting_new_receipt';
  const renewedOk = req && (req.status === 'active' || req.status === 'expiring_soon' || req.payment?.status === 'approved');

  return (
    <PortalShell>
      <div className="space-y-4">
        {/* Header card */}
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t('renewFor')}</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div><p className="text-xl font-bold text-navy-900" dir="ltr">{data.vehicles.map((v) => v.plateNumber).join(' · ')}</p><p className="text-sm text-slate-500">{data.vehicles.map((v) => `${v.brand || ''} ${v.model || ''}`.trim()).filter(Boolean).join(' · ')}</p><p className="text-xs text-slate-400 mt-1">{data.owner.name} · {t('unit')} {data.unitNumber} · {data.compound}</p></div>
            <BodyIcon type={data.vehicles[0]?.vehicleType} className="h-9 w-[72px] text-slate-300 shrink-0" />
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm flex items-center justify-between gap-2">
            <div><p className="text-xs text-slate-500">{t('currentPlan')}</p><p className="font-semibold">{pName(data.current)}</p><p className="text-xs text-slate-500">{t('expiresOn')} {fmtDate(data.current.endDate, lang)}{data.current.daysRemaining >= 0 ? ` · ${t('daysLeft', { n: data.current.daysRemaining })}` : ` · ${t('expiredAgo', { n: -data.current.daysRemaining })}`}</p></div>
            <Badge status={data.current.status} />
          </div>
        </Card>

        {/* Request status (if any) */}
        {req && (
          <Card className={`p-4 border-2 ${renewedOk ? 'border-emerald-300' : req.payment?.status === 'awaiting_new_receipt' ? 'border-red-300' : 'border-amber-300'}`}>
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${renewedOk ? 'bg-emerald-100 text-emerald-700' : req.payment?.status === 'awaiting_new_receipt' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{renewedOk ? <Check /> : req.payment?.status === 'awaiting_new_receipt' ? <AlertTriangle /> : <Clock />}</span>
              <div className="flex-1 text-sm">
                <p className="font-bold text-navy-900">{renewedOk ? t('alreadyRenewed') : t(`st_${req.payment?.status || 'pending_verification'}`)}</p>
                <p className="text-slate-600 mt-0.5">{t('request')} <span className="font-mono">{req.code}</span> · {pName(req)} · {fmtMoney(req.amount, cur, lang)}</p>
                <p className="text-slate-500 text-xs mt-0.5">{renewedOk ? `${t('activeUntil')} ${fmtDate(req.endDate, lang)}` : `${t('newPeriod')}: ${fmtDate(req.startDate, lang)} → ${fmtDate(req.endDate, lang)}`}</p>
                {req.payment?.rejectionReason && req.payment.status === 'awaiting_new_receipt' && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-red-700"><b>{t('rejectedReason')}:</b> {req.payment.rejectionReason}</p>}
                {!renewedOk && req.payment?.status === 'pending_verification' && <p className="text-xs text-slate-400 mt-2">{t('trackHere')}</p>}
              </div>
            </div>
          </Card>
        )}

        {done && !req?.payment?.rejectionReason && req?.payment?.status === 'pending_verification' && (
          <Card className="p-4 bg-emerald-50 border-emerald-200"><p className="font-bold text-emerald-800">{t('doneTitle')}</p><p className="text-sm text-emerald-700 mt-1">{t('doneBody', { code: done.requestCode })}</p></Card>
        )}

        {canSubmit && (
          <>
            {/* Plans */}
            <div>
              <p className="px-1 mb-2 text-sm font-semibold text-slate-700">{t('choosePlan')}</p>
              <div className="space-y-2">{data.plans.map((p) => { const on = p.id === planId; return (
                <button key={p.id} type="button" onClick={() => setPlanId(p.id)} className={`w-full text-start rounded-2xl border-2 p-4 transition-colors ${on ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="font-bold text-navy-900">{pName(p)}{p.isCurrent && <span className="ms-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{t('currentPlan')}</span>}</p><p className="text-xs text-slate-500 mt-0.5">{p.durationDays} {t('days')} · {t('washesN', { n: p.maxWashes })} · {t('perWeek', { n: p.maxFrequencyPerWeek })}</p></div>
                    <div className="text-end"><p className="text-lg font-bold text-navy-900">{fmtMoney(p.price, cur, lang)}</p>{on && <span className="text-[11px] text-brand-600 font-semibold flex items-center gap-1 justify-end"><Check size={12} />{t('selected')}</span>}</div>
                  </div>
                </button>); })}</div>
            </div>

            {/* Payment */}
            <Card className="p-4"><PaymentBox amount={plan?.price} payment={data.payment} currency={cur} /></Card>

            {/* Receipt upload */}
            <Card className="p-4 space-y-3">
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {!file ? (
                <button type="button" onClick={() => fileRef.current.click()} className="w-full rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/40 py-8 flex flex-col items-center gap-2 text-brand-700"><Upload size={28} /><span className="font-semibold">{req?.payment?.status === 'awaiting_new_receipt' ? t('reupload') : t('uploadReceipt')}</span><span className="text-xs text-slate-500">JPG · PNG · PDF</span></button>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">{file.type.startsWith('image/') ? <img src={URL.createObjectURL(file)} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <FileImage className="h-16 w-16 text-slate-400" />}<div className="flex-1 min-w-0 text-sm"><p className="truncate font-medium">{file.name}</p><p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</p></div><button type="button" className="text-xs text-brand-600 font-semibold" onClick={() => fileRef.current.click()}>{t('changeFile')}</button></div>
              )}
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
              {submitErr && <p className="text-sm text-red-600">{submitErr}</p>}
              <BigButton disabled={!file || !planId || busy} onClick={submit} className="bg-brand-600 text-white hover:bg-brand-500 flex items-center justify-center gap-2">{busy ? <Spinner /> : <Check size={18} />}{busy ? t('submitting') : t('submit')}</BigButton>
            </Card>
          </>
        )}
        <p className="text-center text-xs"><Link to="/p/login" className="text-brand-600 underline">{t('loginInstead')}</Link></p>
      </div>
    </PortalShell>
  );
}
