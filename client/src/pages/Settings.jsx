import { useEffect, useState } from 'react';
import { Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useQuery } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { PageHeader, Loading, ErrorBox, Field, Input, Select, Textarea, Spinner, useToast, DaysPicker, Toggle } from '../components/ui.jsx';

function Section({ title, children, onSave, busy }) {
  const t = useI18n().t;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="card p-5">
      <div className="flex items-center justify-between mb-4"><h2 className="text-base font-semibold text-navy-900">{title}</h2><button className="btn-primary btn-sm" disabled={busy}>{busy ? <Spinner /> : <Save size={14} />}{t('common.save')}</button></div>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </form>
  );
}

const TIMEZONES = ['Africa/Cairo', 'Asia/Amman', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Europe/London', 'UTC'];

export default function SettingsPage() {
  const { t } = useI18n(); const { setCompany } = useAuth(); const toast = useToast();
  const { data, loading, error, reload } = useQuery('/admin/settings');
  const [s, setS] = useState(null); const [company, setCompanyForm] = useState(null); const [busy, setBusy] = useState({});
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  useEffect(() => { if (data) { setS(data.settings); setCompanyForm(data.company); } }, [data]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!s || !company) return <Loading />;
  const save = async (section, body, after) => {
    setBusy({ ...busy, [section]: true });
    try { const { data: d } = await api.put(`/admin/settings/${section}`, body); toast.success(t('common.success')); after?.(d); } catch (e) { toast.error(e.message); } finally { setBusy({ ...busy, [section]: false }); }
  };
  const upd = (section, patch) => setS({ ...s, [section]: { ...s[section], ...patch } });
  const numList = (arr) => arr.join(', ');
  const parseList = (str) => str.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
  const changePw = async (e) => { e.preventDefault(); try { await api.post('/auth/change-password', pw); toast.success(t('common.success')); setPw({ currentPassword: '', newPassword: '' }); } catch (err) { toast.error(err.message); } };

  return (
    <div className="fade-in max-w-5xl space-y-5">
      <PageHeader title={t('settings.title')} />
      <Section title={t('settings.company')} busy={busy.company} onSave={() => save('company', company, (d) => setCompany(d))}>
        <Field label={t('settings.companyName')}><Input value={company.name} onChange={(e) => setCompanyForm({ ...company, name: e.target.value })} /></Field>
        <Field label={t('settings.companyNameAr')}><Input dir="rtl" value={company.nameAr || ''} onChange={(e) => setCompanyForm({ ...company, nameAr: e.target.value })} /></Field>
        <Field label={t('settings.currency')}><Input value={company.currency} onChange={(e) => setCompanyForm({ ...company, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label={t('settings.timezone')}><Select value={company.timezone} onChange={(e) => setCompanyForm({ ...company, timezone: e.target.value })}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
        <Field label={t('settings.language')}><Select value={company.language} onChange={(e) => setCompanyForm({ ...company, language: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></Select></Field>
        <Field label={t('settings.dateFormat')}><Select value={company.dateFormat} onChange={(e) => setCompanyForm({ ...company, dateFormat: e.target.value })}>{['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => <option key={f}>{f}</option>)}</Select></Field>
      </Section>

      <Section title={t('settings.general')} busy={busy.general} onSave={() => save('general', s.general)}>
        <Field label={t('settings.expiringSoonDays')}><Input type="number" min="1" max="90" value={s.general.expiringSoonDays} onChange={(e) => upd('general', { expiringSoonDays: Number(e.target.value) })} /></Field>
        <Field label={t('settings.weekStartsOn')}><Select value={s.general.weekStartsOn} onChange={(e) => upd('general', { weekStartsOn: Number(e.target.value) })}>{t('common.weekdays').map((d, i) => <option key={i} value={i}>{d}</option>)}</Select></Field>
        <Field label={t('settings.defaultWashingDays')} className="sm:col-span-2"><DaysPicker value={s.general.defaultWashingDays} onChange={(v) => upd('general', { defaultWashingDays: v })} /></Field>
      </Section>

      <Section title={t('settings.bank')} busy={busy.bank} onSave={() => save('bank', s.bank)}>
        <Field label={t('settings.bankName')}><Input value={s.bank.bankName} onChange={(e) => upd('bank', { bankName: e.target.value })} /></Field>
        <Field label={t('settings.accountName')}><Input value={s.bank.accountName} onChange={(e) => upd('bank', { accountName: e.target.value })} /></Field>
        <Field label={t('settings.accountNumber')}><Input dir="ltr" value={s.bank.accountNumber} onChange={(e) => upd('bank', { accountNumber: e.target.value })} /></Field>
        <Field label={t('settings.iban')}><Input dir="ltr" value={s.bank.iban} onChange={(e) => upd('bank', { iban: e.target.value })} /></Field>
        <Field label={t('settings.instructions')} className="sm:col-span-2"><Textarea rows={3} value={s.bank.instructions} onChange={(e) => upd('bank', { instructions: e.target.value })} /></Field>
      </Section>

      <Section title={t('settings.sms')} busy={busy.sms} onSave={() => save('sms', { provider: s.sms.provider, apiUrl: s.sms.apiUrl, apiKey: s.sms.apiKey, senderId: s.sms.senderId }, (d) => upd('sms', d))}>
        <div className={`sm:col-span-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${s.sms.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>{s.sms.configured ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}{s.sms.configured ? t('settings.smsConfigured') : t('settings.smsNotConfigured')}</div>
        <Field label={t('settings.smsProvider')}><Input placeholder="e.g. Twilio, Vonage, local gateway" value={s.sms.provider === 'none' ? '' : s.sms.provider} onChange={(e) => upd('sms', { provider: e.target.value || 'none' })} /></Field>
        <Field label={t('settings.smsSender')}><Input dir="ltr" value={s.sms.senderId} onChange={(e) => upd('sms', { senderId: e.target.value })} /></Field>
        <Field label={t('settings.smsApiUrl')}><Input dir="ltr" value={s.sms.apiUrl} onChange={(e) => upd('sms', { apiUrl: e.target.value })} /></Field>
        <Field label={t('settings.smsApiKey')}><Input dir="ltr" type="password" autoComplete="off" value={s.sms.apiKey} onChange={(e) => upd('sms', { apiKey: e.target.value })} /></Field>
      </Section>

      <Section title={t('settings.otp')} busy={busy.otp} onSave={() => save('otp', s.otp)}>
        <Field label={t('settings.otpLength')}><Input type="number" min="4" max="8" value={s.otp.length} onChange={(e) => upd('otp', { length: Number(e.target.value) })} /></Field>
        <Field label={t('settings.otpExpiry')}><Input type="number" min="1" max="60" value={s.otp.expiryMinutes} onChange={(e) => upd('otp', { expiryMinutes: Number(e.target.value) })} /></Field>
        <Field label={t('settings.otpAttempts')}><Input type="number" min="1" max="20" value={s.otp.maxAttempts} onChange={(e) => upd('otp', { maxAttempts: Number(e.target.value) })} /></Field>
        <Field label={t('settings.otpCooldown')}><Input type="number" min="10" max="600" value={s.otp.resendCooldownSeconds} onChange={(e) => upd('otp', { resendCooldownSeconds: Number(e.target.value) })} /></Field>
      </Section>

      <Section title={t('settings.photos')} busy={busy.photos} onSave={() => save('photos', s.photos)}>
        <Field label={t('settings.minBefore')}><Input type="number" min="1" max="10" value={s.photos.minBeforePhotos} onChange={(e) => upd('photos', { minBeforePhotos: Number(e.target.value) })} /></Field>
        <Field label={t('settings.minAfter')}><Input type="number" min="1" max="10" value={s.photos.minAfterPhotos} onChange={(e) => upd('photos', { minAfterPhotos: Number(e.target.value) })} /></Field>
        <Field label={t('settings.maxPhotoSize')}><Input type="number" min="1" max="50" value={s.photos.maxPhotoSizeMb} onChange={(e) => upd('photos', { maxPhotoSizeMb: Number(e.target.value) })} /></Field>
      </Section>

      <Section title={t('settings.notifications')} busy={busy.notifications} onSave={() => save('notifications', s.notifications)}>
        <Field label={t('settings.reminderDays')} hint={t('settings.commaHint')}><Input dir="ltr" defaultValue={numList(s.notifications.expiryReminderDays)} onBlur={(e) => upd('notifications', { expiryReminderDays: parseList(e.target.value) })} /></Field>
        <Field label={t('settings.postExpiry')} hint={t('settings.commaHint')}><Input dir="ltr" defaultValue={numList(s.notifications.postExpiryReminderDays)} onBlur={(e) => upd('notifications', { postExpiryReminderDays: parseList(e.target.value) })} /></Field>
        <div className="sm:col-span-2 space-y-2"><Toggle checked={s.notifications.notifyAdminOnPendingPayment} onChange={(v) => upd('notifications', { notifyAdminOnPendingPayment: v })} label={t('settings.notifyPending')} /><br /><Toggle checked={s.notifications.notifyAdminOnIssue} onChange={(v) => upd('notifications', { notifyAdminOnIssue: v })} label={t('settings.notifyIssue')} /></div>
      </Section>

      <form id="password" onSubmit={changePw} className="card p-5">
        <h2 className="text-base font-semibold text-navy-900 mb-4">{t('settings.changePassword')}</h2>
        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <Field label={t('settings.currentPassword')}><Input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
          <Field label={t('common.password')}><Input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
          <button className="btn-primary">{t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
