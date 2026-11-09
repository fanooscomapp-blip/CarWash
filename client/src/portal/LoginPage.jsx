import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Phone, ShieldCheck, AlertTriangle } from 'lucide-react';
import { papi, usePortal } from './portalLib.jsx';
import { PortalShell, Card, BigButton, Spinner } from './PortalLayout.jsx';

export default function LoginPage() {
  const { t, login, loggedIn } = usePortal(); const navigate = useNavigate(); const loc = useLocation();
  const [mobile, setMobile] = useState(''); const [step, setStep] = useState('mobile'); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [info, setInfo] = useState(null); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const id = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(id); }, [cooldown]);
  if (loggedIn) return <Navigate to={loc.state?.from?.pathname || '/p/home'} replace />;

  const request = async () => {
    setBusy(true); setErr(null);
    try { const r = await papi.post('/otp/request', { mobile }); setInfo(r.data); setStep('code'); setCooldown(60); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    try { const r = await papi.post('/otp/verify', { mobile, code }); login(r.data.token, r.data.owner); navigate(loc.state?.from?.pathname || '/p/home', { replace: true }); }
    catch (e) { setErr(e.status === 401 ? (e.message || t('invalidCode')) : e.message); } finally { setBusy(false); }
  };

  return (
    <PortalShell>
      <div className="pt-6">
        <div className="text-center mb-6"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy-900 text-white"><ShieldCheck size={28} /></span><h1 className="mt-3 text-2xl font-bold text-navy-900">{t('login')}</h1><p className="text-sm text-slate-500 mt-1">{t('mobileHint')}</p></div>
        <Card className="p-5 space-y-4">
          {step === 'mobile' ? (
            <>
              <label className="block"><span className="text-xs font-semibold text-slate-500">{t('mobile')}</span>
                <div className="mt-1 relative"><Phone size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" /><input dir="ltr" inputMode="tel" autoFocus className="w-full rounded-xl border border-slate-300 ps-10 pe-3 py-3 text-lg tracking-wide" placeholder="01xxxxxxxxx" value={mobile} onChange={(e) => setMobile(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && mobile.replace(/\D/g, '').length >= 10 && request()} /></div></label>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <BigButton disabled={busy || mobile.replace(/\D/g, '').length < 10} onClick={request} className="bg-brand-600 text-white hover:bg-brand-500">{busy ? <Spinner /> : t('sendCode')}</BigButton>
            </>
          ) : (
            <>
              <div className="text-sm"><p className="font-semibold text-slate-800">{t('codeSent')}</p><p className="text-slate-500" dir="ltr">{mobile}</p>{info?.expiresInMinutes && <p className="text-xs text-slate-400 mt-0.5">{t('codeHint', { m: info.expiresInMinutes })}</p>}</div>
              {info?.delivery === 'not_configured' && <p className="flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('notDelivered')}</p>}
              <input dir="ltr" inputMode="numeric" autoFocus maxLength={8} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-2xl font-bold tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && code.length >= 4 && verify()} />
              {err && <p className="text-sm text-red-600">{err}</p>}
              <BigButton disabled={busy || code.length < 4} onClick={verify} className="bg-navy-900 text-white hover:bg-navy-800">{busy ? <Spinner /> : t('verify')}</BigButton>
              <div className="flex justify-between text-xs"><button className="text-slate-500 underline" onClick={() => { setStep('mobile'); setCode(''); setErr(null); }}>{t('changeNumber')}</button><button disabled={cooldown > 0} className="text-brand-600 font-semibold disabled:text-slate-400" onClick={request}>{cooldown > 0 ? t('resendIn', { s: cooldown }) : t('resend')}</button></div>
            </>
          )}
        </Card>
      </div>
    </PortalShell>
  );
}
