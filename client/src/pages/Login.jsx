import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Droplets, Languages } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Field, Input, Spinner } from '../components/ui.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await login(form.email.trim(), form.password); navigate(location.state?.from?.pathname || '/', { replace: true }); }
    catch (err) { setError(err.status === 401 ? t('auth.invalid') : err.message); }
    finally { setBusy(false); }
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
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('auth.email')}><Input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('auth.password')}><Input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy && <Spinner />}{busy ? t('auth.signingIn') : t('auth.signIn')}</button>
          </form>
          <p className="mt-6 text-xs text-slate-400 text-center">{t('auth.demoHint')}</p>
        </div>
      </div>
    </div>
  );
}
