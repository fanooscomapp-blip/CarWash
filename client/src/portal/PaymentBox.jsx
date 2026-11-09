import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { usePortal, fmtMoney } from './portalLib.jsx';

// Shared payment block: amount (copy), InstaPay number (copy), "Open InstaPay" deep link, instructions.
export default function PaymentBox({ amount, payment, currency }) {
  const { t, lang } = usePortal();
  const [copied, setCopied] = useState(null);
  const copy = async (what, value) => { try { await navigator.clipboard.writeText(String(value)); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ } };
  const amountNum = Number(amount || 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{t('total')}</p>
        <div className="flex items-center gap-2"><p className="text-2xl font-bold text-navy-900">{fmtMoney(amountNum, currency, lang)}</p><button type="button" onClick={() => copy('amount', amountNum)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 flex items-center gap-1">{copied === 'amount' ? <Check size={13} /> : <Copy size={13} />}{copied === 'amount' ? t('copied') : t('copyAmount')}</button></div>
      </div>
      <div className="rounded-xl bg-navy-900 text-white p-4">
        <p className="text-xs text-slate-300">{t('payVia')}</p>
        <div className="mt-1 flex items-center justify-between gap-2"><p className="text-xl font-bold tracking-wide" dir="ltr">{payment?.instapayAddress || '—'}</p><button type="button" onClick={() => copy('addr', payment?.instapayAddress)} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 flex items-center gap-1">{copied === 'addr' ? <Check size={14} /> : <Copy size={14} />}{copied === 'addr' ? t('copied') : t('copy')}</button></div>
        {payment?.instapayName && <p className="text-xs text-slate-300 mt-1">{t('payTo')}: {payment.instapayName}</p>}
        {payment?.instapayLink && (
          <a href={payment.instapayLink} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#7b2cbf] py-3 text-base font-bold text-white hover:bg-[#6a23a8]"><ExternalLink size={18} />{t('openInstapay')} · {fmtMoney(amountNum, currency, lang)}</a>
        )}
        {payment?.instapayLink && <p className="mt-1.5 text-[11px] text-slate-300 text-center">{t('instapayHint')}</p>}
      </div>
      <p className="text-xs text-slate-500">{(lang === 'ar' ? payment?.instructionsAr : payment?.instructions) || t('thenUpload')}</p>
    </div>
  );
}
