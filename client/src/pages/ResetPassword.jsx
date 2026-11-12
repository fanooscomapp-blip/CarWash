import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Droplets, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Field, Input, Spinner } from '../components/ui.jsx';

// Landing page of the emailed reset link: /reset-password/:token
export default function ResetPassword() {
  const { token } = useParams();
  const { t } = useI18n();
  const { adopt } = useAuth();
  const navigate = useNavigate();
  const [check, setCheck] = useState({ loading: true, valid: false, email: null });
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { api.get(`/auth/reset/${token}`).then(({ data }) => setCheck({ loading: false, ...data })).catch(() => setCheck({ loading: false, valid: false })); }, [token]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const { data } = await api.post('/auth/reset', { token, newPassword: form.newPassword }); adopt(data, true); navigate('/', { replace: true }); }
    catch (err) { setError(err.status === 422 ? t('auth.linkInvalid') : err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm card p-6">
        <div className="flex items-center gap-2 text-navy-900 mb-6"><Droplets size={22} /><span className="font-semibold">{t('app.name')}</span></div>
        <h1 className="text-xl font-semibold text-navy-900 flex items-center gap-2"><KeyRound size={18} />{t('auth.resetTitle')}</h1>
        {check.loading ? <div className="py-8 flex justify-center"><Spinner /></div> : !check.valid ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{t('auth.linkInvalid')}</p>
            <Link to="/login" className="btn-primary w-full justify-center">{t('auth.backToLogin')}</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <p className="text-sm text-slate-500">{t('auth.resetFor', { email: check.email })}</p>
            <Field label={t('auth.newPassword')}><Input type="password" autoComplete="new-password" minLength={8} required autoFocus value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
            <Field label={t('auth.confirmPassword')}><Input type="password" autoComplete="new-password" minLength={8} required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
            {form.confirm && form.confirm !== form.newPassword && <p className="text-xs text-orange-600">{t('auth.mismatch')}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={busy || form.newPassword.length < 8 || form.newPassword !== form.confirm}>{busy && <Spinner />}{t('auth.resetPassword')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
