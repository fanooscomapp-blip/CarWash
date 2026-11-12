import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Droplets, Languages, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Field, Input, Spinner } from '../components/ui.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [mode, setMode] = useState('login'); // login | forgot | reset
  const [fp, setFp] = useState({ code: '', newPassword: '', confirm: '', info: null });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await login(form.email.trim(), form.password, form.remember); navigate(location.state?.from?.pathname || '/', { replace: true }); }
    catch (err) { setError(err.status === 401 ? t('auth.invalid') : err.message); }
    finally { setBusy(false); }
  };

  const forgot = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const { data } = await api.post('/auth/forgot', { email: form.email.trim() });
      if (!data.sent) { setError(data.reason === 'NO_MOBILE' ? t('auth.noMobile') : data.reason === 'SMS_FAILED' ? t('auth.smsFailed') : t('auth.noAccount')); return; }
      setFp({ code: '', newPassword: '', confirm: '', info: data }); setMode('reset');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const reset = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api.post('/auth/reset', { email: form.email.trim(), code: fp.code, newPassword: fp.newPassword });
      await login(form.email.trim(), fp.newPassword, form.remember); navigate('/', { replace: true });
    } catch (err) { setError(err.status === 422 ? t('auth.badCode') : err.message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-navy-900 text-white p-12 relative overflow-hidden">
        <div className="absolute -top-24 -end-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -start-16 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600"><Droplets size={24} /></div><span className="text-lg font-semibold">{t('app.name')}</span></div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">{t('app.tagline')}</h2>
          <p className="mt-4 text-slate-300 text-sm leading-relaxed">Compounds · Units · Vehicles · Subscriptions · Renewals · Payments · Washing operations · Staff · SMS · QR</p>
        </div>
        <p className="relative text-xs text-slate-400">© {new Date().getFullYear()}</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="lg:hidden flex items-center gap-2 text-navy-900"><Droplets size={22} /><span className="font-semibold">{t('app.name')}</span></div>
            <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="btn-ghost btn-sm ms-auto"><Languages size={15} />{lang === 'en' ? 'العربية' : 'English'}</button>
          </div>
          <h1 className="text-2xl font-semibold text-navy-900">{t('auth.welcome')}</h1>
          <p className="text-sm text-slate-500 mt-1 mb-8">{t('auth.subtitle')}</p>
          {mode === 'login' && <form onSubmit={submit} className="space-y-4">
            <Field label={t('auth.email')}><Input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('auth.password')}><Input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />{t('auth.rememberMe')}</label>
              <button type="button" className="text-brand-600 hover:underline" onClick={() => { setError(null); setMode('forgot'); }}>{t('auth.forgot')}</button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Spinner />}{busy ? t('auth.signingIn') : t('auth.signIn')}</button>
          </form>}
          {mode === 'forgot' && <form onSubmit={forgot} className="space-y-4">
            <p className="text-sm text-slate-600">{t('auth.forgotHint')}</p>
            <Field label={t('auth.email')}><Input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Spinner />}{t('auth.sendCode')}</button>
            <button type="button" className="btn-ghost w-full" onClick={() => { setError(null); setMode('login'); }}><ArrowLeft size={14} className="rtl:rotate-180" />{t('auth.backToLogin')}</button>
          </form>}
          {mode === 'reset' && <form onSubmit={reset} className="space-y-4">
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{t('auth.codeSent', { mobile: fp.info?.maskedMobile || '', minutes: fp.info?.minutes || 10 })}</p>
            <Field label={t('auth.code')}><Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={fp.code} onChange={(e) => setFp({ ...fp, code: e.target.value.replace(/\D/g, '') })} className="text-center text-lg tracking-[0.4em]" /></Field>
            <Field label={t('auth.newPassword')}><Input type="password" autoComplete="new-password" minLength={8} required value={fp.newPassword} onChange={(e) => setFp({ ...fp, newPassword: e.target.value })} /></Field>
            <Field label={t('auth.confirmPassword')}><Input type="password" autoComplete="new-password" minLength={8} required value={fp.confirm} onChange={(e) => setFp({ ...fp, confirm: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy || fp.code.length !== 6 || fp.newPassword.length < 8 || fp.newPassword !== fp.confirm}>{busy && <Spinner />}{t('auth.resetPassword')}</button>
            <button type="button" className="btn-ghost w-full" onClick={() => { setError(null); setMode('forgot'); }}>{t('auth.resend')}</button>
          </form>}
        </div>
      </div>
    </div>
  );
}
