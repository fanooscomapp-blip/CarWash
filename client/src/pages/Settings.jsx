import { useEffect, useState } from 'react';
import { Save, AlertTriangle, CheckCircle2, Send } from 'lucide-react';
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
  const [testMobile, setTestMobile] = useState(''); const [testBusy, setTestBusy] = useState(false); const [testResult, setTestResult] = useState(null);
  const sendTest = async () => { setTestBusy(true); setTestResult(null); try { const { data: d } = await api.post('/admin/settings/sms/test', { mobile: testMobile }); setTestResult(d); } catch (e) { toast.error(e.message); } finally { setTestBusy(false); } };
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

      <Section title={t('settings.payment')} busy={busy.payment} onSave={() => save('payment', s.payment)}>
        <Field label={t('settings.paymentMethod')}><Select value={s.payment.method} onChange={(e) => upd('payment', { method: e.target.value })}><option value="instapay">InstaPay</option><option value="bank">{t('settings.bankTransfer')}</option><option value="cash_only">{t('settings.cashOnly')}</option></Select></Field>
        <div />
        {s.payment.method === 'instapay' && <>
          <Field label={t('settings.instapayAddress')} hint={t('settings.instapayHint')}><Input dir="ltr" value={s.payment.instapayAddress} onChange={(e) => upd('payment', { instapayAddress: e.target.value })} placeholder="01xxxxxxxxx / name@instapay" /></Field>
          <Field label={t('settings.instapayName')}><Input value={s.payment.instapayName} onChange={(e) => upd('payment', { instapayName: e.target.value })} /></Field>
          <Field label={t('settings.instapayLink')} hint={t('settings.instapayLinkHint')} className="sm:col-span-2"><Input dir="ltr" value={s.payment.instapayLink || ''} onChange={(e) => upd('payment', { instapayLink: e.target.value })} placeholder="https://ipn.eg/S/yourname/instapay/XXXXX" /></Field>
        </>}
        <Field label={t('settings.instructionsEn')}><Textarea rows={2} value={s.payment.instructions} onChange={(e) => upd('payment', { instructions: e.target.value })} /></Field>
        <Field label={t('settings.instructionsAr')}><Textarea rows={2} dir="rtl" value={s.payment.instructionsAr} onChange={(e) => upd('payment', { instructionsAr: e.target.value })} /></Field>
        {s.payment.method === 'bank' && <>
          <Field label={t('settings.bankName')}><Input value={s.bank.bankName} onChange={(e) => upd('bank', { bankName: e.target.value })} onBlur={() => save('bank', s.bank)} /></Field>
          <Field label={t('settings.accountNumber')}><Input dir="ltr" value={s.bank.accountNumber} onChange={(e) => upd('bank', { accountNumber: e.target.value })} onBlur={() => save('bank', s.bank)} /></Field>
        </>}
      </Section>

      <Section title={t('settings.sms')} busy={busy.sms} onSave={() => save('sms', { provider: s.sms.provider, username: s.sms.username, password: s.sms.password, senderId: s.sms.senderId, environment: s.sms.environment, apiUrl: s.sms.apiUrl, apiKey: s.sms.apiKey, defaultLang: s.sms.defaultLang }, (d) => upd('sms', d))}>
        <div className={`sm:col-span-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${s.sms.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>{s.sms.configured ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}{s.sms.configured ? t('settings.smsConfigured') : t('settings.smsNotConfigured')}</div>
        <Field label={t('settings.smsProvider')}><Select value={s.sms.provider} onChange={(e) => upd('sms', { provider: e.target.value })}><option value="none">{t('common.none')}</option><option value="smsmisr">SMS Misr</option><option value="generic">{t('settings.smsGeneric')}</option></Select></Field>
        <Field label={t('settings.smsLang')}><Select value={s.sms.defaultLang} onChange={(e) => upd('sms', { defaultLang: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></Select></Field>
        {s.sms.provider === 'smsmisr' && <>
          <Field label="Username"><Input dir="ltr" autoComplete="off" value={s.sms.username} onChange={(e) => upd('sms', { username: e.target.value })} /></Field>
          <Field label="Password / Token"><Input dir="ltr" type="password" autoComplete="new-password" value={s.sms.password} onChange={(e) => upd('sms', { password: e.target.value })} /></Field>
          <Field label="Sender ID" hint={t('settings.senderHint')} ><Input dir="ltr" value={s.sms.senderId} onChange={(e) => upd('sms', { senderId: e.target.value })} /></Field>
          <Field label={t('settings.smsEnv')}><Select value={s.sms.environment} onChange={(e) => upd('sms', { environment: e.target.value })}><option value="live">Live</option><option value="test">Test</option></Select></Field>
        </>}
        {s.sms.provider === 'generic' && <>
          <Field label={t('settings.smsApiUrl')}><Input dir="ltr" value={s.sms.apiUrl} onChange={(e) => upd('sms', { apiUrl: e.target.value })} /></Field>
          <Field label={t('settings.smsApiKey')}><Input dir="ltr" type="password" autoComplete="off" value={s.sms.apiKey} onChange={(e) => upd('sms', { apiKey: e.target.value })} /></Field>
          <Field label="Sender ID"><Input dir="ltr" value={s.sms.senderId} onChange={(e) => upd('sms', { senderId: e.target.value })} /></Field>
        </>}
        <div className="sm:col-span-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-3">
          <Field label={t('settings.smsTestTo')} className="flex-1 min-w-48"><Input dir="ltr" value={testMobile} onChange={(e) => setTestMobile(e.target.value)} placeholder="01xxxxxxxxx" /></Field>
          <button type="button" className="btn-secondary" disabled={!testMobile || testBusy} onClick={sendTest}>{testBusy ? <Spinner /> : <Send size={14} />}{t('settings.smsTest')}</button>
          {testResult && <p className={`basis-full text-sm ${testResult.status === 'sent' ? 'text-emerald-700' : 'text-red-600'}`}>{t(`sms.status_${testResult.status}`)}{testResult.providerResponse?.codeMeaning ? ` — ${testResult.providerResponse.codeMeaning}` : testResult.providerResponse?.error ? ` — ${testResult.providerResponse.error}` : testResult.providerResponse?.reason ? ` — ${testResult.providerResponse.reason}` : ''}</p>}
        </div>
        <p className="sm:col-span-2 text-xs text-slate-500">{t('settings.smsTestHint')}</p>
      </Section>

      <Section title={t('settings.portal')} busy={busy.portal} onSave={() => save('portal', s.portal)}>
        <Field label={t('settings.portalBaseUrl')} hint={t('settings.portalBaseUrlHint')} className="sm:col-span-2"><Input dir="ltr" value={s.portal.baseUrl} onChange={(e) => upd('portal', { baseUrl: e.target.value })} placeholder={window.location.origin} /></Field>
        <Field label={t('settings.linkValidDays')}><Input type="number" min="1" max="365" value={s.portal.linkValidDays} onChange={(e) => upd('portal', { linkValidDays: Number(e.target.value) })} /></Field>
        <Field label={t('settings.sessionDays')}><Input type="number" min="1" max="365" value={s.portal.sessionDays} onChange={(e) => upd('portal', { sessionDays: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2"><Toggle checked={s.portal.selfRegistration !== false} onChange={(v) => upd('portal', { selfRegistration: v })} label={t('settings.selfRegistration')} /></div>
        <Field label={t('settings.joinMaxPerHour')}><Input type="number" min="1" max="100" value={s.portal.joinMaxPerHour ?? 5} onChange={(e) => upd('portal', { joinMaxPerHour: Number(e.target.value) })} /></Field>
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

      <Section title={t('settings.assignment')} busy={busy.assignment} onSave={() => save('assignment', s.assignment)}>
        <div className="sm:col-span-2"><Toggle checked={s.assignment.enabled} onChange={(v) => upd('assignment', { enabled: v })} label={t('settings.assignEnabled')} /></div>
        <Field label={t('settings.assignHour')} hint={t('settings.assignHourHint')}><Input type="number" min="0" max="23" value={s.assignment.assignHour} onChange={(e) => upd('assignment', { assignHour: Number(e.target.value) })} /></Field>
        <Field label={t('settings.maxPerStaff')}><Input type="number" min="0" max="200" value={s.assignment.maxPerStaffPerDay} onChange={(e) => upd('assignment', { maxPerStaffPerDay: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2 flex flex-col gap-2 items-start">
          <Toggle checked={s.assignment.preferLastWasher} onChange={(v) => upd('assignment', { preferLastWasher: v })} label={t('settings.preferLastWasher')} />
          <Toggle checked={s.assignment.publishUnassignedToPool} onChange={(v) => upd('assignment', { publishUnassignedToPool: v })} label={t('settings.publishPool')} />
        </div>
      </Section>

      <Section title={t('settings.outcomes')} busy={busy.outcomes} onSave={() => save('outcomes', s.outcomes)}>
        <div className="sm:col-span-2 space-y-2">
          <p className="text-xs text-slate-500">{t('settings.outcomesHint')}</p>
          <div className="hidden sm:grid grid-cols-[1fr_1.4fr_1.4fr_auto_auto_auto] gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1"><span>{t('settings.outcomeKey')}</span><span>{t('settings.outcomeLabelEn')}</span><span>{t('settings.outcomeLabelAr')}</span><span>{t('settings.outcomeQuota')}</span><span>{t('settings.outcomePhoto')}</span><span /></div>
          {s.outcomes.map((o, i) => { const setO = (patch) => setS({ ...s, outcomes: s.outcomes.map((x, j) => (j === i ? { ...x, ...patch } : x)) }); return (
            <div key={i} className="grid sm:grid-cols-[1fr_1.4fr_1.4fr_auto_auto_auto] gap-2 items-center rounded-lg border border-slate-200 p-2">
              <Input dir="ltr" value={o.key} onChange={(e) => setO({ key: e.target.value.toLowerCase().replace(/[^a-z_]/g, '') })} placeholder="not_found" />
              <Input value={o.labelEn} onChange={(e) => setO({ labelEn: e.target.value })} />
              <Input value={o.labelAr} onChange={(e) => setO({ labelAr: e.target.value })} />
              <Toggle checked={!!o.consumesQuota} onChange={(v) => setO({ consumesQuota: v })} />
              <Toggle checked={!!o.requiresPhoto} onChange={(v) => setO({ requiresPhoto: v })} />
              <button type="button" className="btn-secondary btn-sm text-red-600" disabled={s.outcomes.length <= 1} onClick={() => setS({ ...s, outcomes: s.outcomes.filter((_, j) => j !== i) })}>×</button>
            </div>); })}
          <button type="button" className="btn-secondary btn-sm" disabled={s.outcomes.length >= 12} onClick={() => setS({ ...s, outcomes: [...s.outcomes, { key: '', icon: 'alert', labelEn: '', labelAr: '', consumesQuota: false, requiresPhoto: false }] })}>{t('settings.addOutcome')}</button>
        </div>
      </Section>

      <Section title={t('settings.notifications')} busy={busy.notifications} onSave={() => save('notifications', s.notifications)}>
        <Field label={t('settings.reminderDays')} hint={t('settings.reminderDaysHint')}><Input dir="ltr" defaultValue={numList(s.notifications.expiryReminderDays)} onBlur={(e) => upd('notifications', { expiryReminderDays: parseList(e.target.value) })} /></Field>
        <Field label={t('settings.postExpiry')} hint={t('settings.commaHint')}><Input dir="ltr" defaultValue={numList(s.notifications.postExpiryReminderDays)} onBlur={(e) => upd('notifications', { postExpiryReminderDays: parseList(e.target.value) })} /></Field>
        <div className="sm:col-span-2 grid sm:grid-cols-2 gap-2">
          <Toggle checked={s.notifications.sendOnExpiry} onChange={(v) => upd('notifications', { sendOnExpiry: v })} label={t('settings.sendOnExpiry')} />
          <Toggle checked={s.notifications.smsOnPaymentApproved} onChange={(v) => upd('notifications', { smsOnPaymentApproved: v })} label={t('settings.smsOnApproved')} />
          <Toggle checked={s.notifications.smsOnPaymentRejected} onChange={(v) => upd('notifications', { smsOnPaymentRejected: v })} label={t('settings.smsOnRejected')} />
          <Toggle checked={s.notifications.smsOnWashCompleted} onChange={(v) => upd('notifications', { smsOnWashCompleted: v })} label={t('settings.smsOnWash')} />
          <Toggle checked={s.notifications.notifyAdminOnPendingPayment} onChange={(v) => upd('notifications', { notifyAdminOnPendingPayment: v })} label={t('settings.notifyPending')} />
          <Toggle checked={s.notifications.notifyAdminOnIssue} onChange={(v) => upd('notifications', { notifyAdminOnIssue: v })} label={t('settings.notifyIssue')} />
        </div>
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
