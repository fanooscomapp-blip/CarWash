import { useState } from 'react';
import { Send, CheckCircle2, XCircle, AlertTriangle, Pencil, Users } from 'lucide-react';
import { useQuery, useLookups, useDebounced } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { PageHeader, Tabs, KpiCard, DataTable, Select, SearchInput, Modal, Field, Input, Textarea, Spinner, useToast, StatusBadge, Loading } from '../components/ui.jsx';

const STATUS_LABEL = { sent: 'sent', failed: 'failed', not_configured: 'not_configured', queued: 'queued' };

export default function SmsCenter() {
  const { t, lang } = useI18n(); const { can } = useAuth(); const toast = useToast(); const lookups = useLookups();
  const [tab, setTab] = useState('logs'); const [status, setStatus] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [compose, setCompose] = useState(false); const [tpl, setTpl] = useState(null);
  const q = useDebounced(search);
  const st = useQuery('/admin/sms/status'); const logs = useQuery('/admin/sms/logs', { status, search: q, page, pageSize: 50 }); const templates = useQuery('/admin/settings/sms-templates', {}, { enabled: tab === 'templates' });
  const columns = [
    { key: 'createdAt', header: t('audit.when'), render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(r.createdAt, lang)}</span> },
    { key: 'toMobile', header: t('common.mobile'), render: (r) => <span dir="ltr">{r.toMobile}</span> },
    { key: 'templateKey', header: t('sms.template'), render: (r) => r.templateKey ? <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">{r.templateKey}</span> : <span className="text-xs text-slate-400">{t('sms.freeText')}</span> },
    { key: 'body', header: t('sms.message'), render: (r) => <p className="max-w-md text-xs text-slate-700 whitespace-pre-wrap break-words" dir="auto">{r.body}</p> },
    { key: 'status', header: t('common.status'), render: (r) => <div><StatusBadge status={r.status === 'sent' ? 'approved' : r.status === 'failed' ? 'rejected' : r.status === 'not_configured' ? 'suspended' : 'pending'} label={t(`sms.status_${r.status}`)} />{r.providerResponse?.codeMeaning && <p className="text-[11px] text-slate-500 mt-1">{r.providerResponse.codeMeaning}</p>}{r.providerResponse?.error && <p className="text-[11px] text-red-600 mt-1">{r.providerResponse.error}</p>}</div> },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('sms.title')} subtitle={t('sms.subtitle')} actions={can('sms.send') && <button className="btn-primary" onClick={() => setCompose(true)}><Send size={16} />{t('sms.compose')}</button>} />
      {st.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className={`card p-4 flex items-start gap-3 ${st.data.configured ? '' : 'border-orange-300 bg-orange-50/50'}`}>{st.data.configured ? <CheckCircle2 className="text-emerald-600 shrink-0" /> : <AlertTriangle className="text-orange-500 shrink-0" />}<div><p className="text-xs text-slate-500">{t('sms.provider')}</p><p className="font-semibold text-navy-900">{st.data.configured ? `${st.data.provider} · ${st.data.senderId}` : t('sms.notConfigured')}</p>{st.data.configured && st.data.environment === 'test' && <p className="text-[11px] text-orange-600">{t('sms.testEnv')}</p>}</div></div>
          <KpiCard label={t('sms.sent30')} value={st.data.counts.last30} tone="info" />
          <KpiCard label={t('sms.status_sent')} value={st.data.counts.sent} tone="success" />
          <KpiCard label={t('sms.status_failed')} value={st.data.counts.failed + st.data.counts.not_configured} tone={st.data.counts.failed ? 'danger' : 'default'} />
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'logs', label: t('sms.logs') }, { value: 'templates', label: t('sms.templates') }]} />
      {tab === 'logs' && <>
        <div className="flex flex-wrap gap-2 mb-4"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-72" /><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-48"><option value="">{t('common.status')}: {t('common.all')}</option>{Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{t(`sms.status_${s}`)}</option>)}</Select></div>
        <DataTable columns={columns} rows={logs.data?.data} loading={logs.loading} error={logs.error} onRetry={logs.reload} pagination={logs.data?.pagination} onPage={setPage} />
      </>}
      {tab === 'templates' && (!templates.data ? <Loading /> : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{t('sms.placeholders')}: {templates.data.placeholders.map((p) => <code key={p} className="bg-slate-100 rounded px-1 mx-0.5">{`{${p}}`}</code>)}</p>
          <div className="grid md:grid-cols-2 gap-3">{templates.data.templates.map((x) => (
            <div key={x.id} className="card p-4"><div className="flex items-center justify-between mb-2"><p className="font-mono text-xs font-semibold">{x.key} <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase">{x.lang}</span></p>{can('sms.send') && <button className="btn-ghost btn-sm" onClick={() => setTpl(x)}><Pencil size={13} />{t('common.edit')}</button>}</div><p className="text-sm text-slate-700 whitespace-pre-wrap" dir="auto">{x.body}</p></div>))}</div>
        </div>
      ))}
      {compose && <Compose onClose={() => setCompose(false)} onSent={() => { logs.reload(); st.reload(); }} lookups={lookups.data} />}
      {tpl && <TemplateEdit tpl={tpl} onClose={() => setTpl(null)} onSaved={templates.reload} />}
    </div>
  );
}

function Compose({ onClose, onSent, lookups }) {
  const { t } = useI18n(); const toast = useToast();
  const [mode, setMode] = useState('single'); const [mobiles, setMobiles] = useState(''); const [compoundId, setCompoundId] = useState(''); const [statuses, setStatuses] = useState([]); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const send = async () => {
    setBusy(true);
    try { const payload = { message }; if (mode === 'single') payload.mobiles = mobiles.split(/[\n,]/).map((s) => s.trim()).filter(Boolean); else { if (compoundId) payload.compoundId = compoundId; if (statuses.length) payload.subscriptionStatuses = statuses; } const { data } = await api.post('/admin/sms/send', payload); setResult(data); onSent(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('sms.compose')} footer={<><button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>{!result && <button className="btn-primary" disabled={busy || !message.trim() || (mode === 'single' ? !mobiles.trim() : !compoundId && !statuses.length)} onClick={send}>{busy && <Spinner />}<Send size={15} />{t('sms.send')}</button>}</>}>
      {result ? <div className="text-sm space-y-2"><p className="font-semibold">{t('sms.result', { total: result.total, sent: result.sent, failed: result.failed })}</p>{result.notConfigured > 0 && <p className="text-orange-600 flex items-center gap-2"><AlertTriangle size={15} />{t('sms.notConfiguredNote')}</p>}</div> : (
        <div className="space-y-4">
          <div className="flex gap-2">{['single', 'bulk'].map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`btn btn-sm ${mode === m ? 'bg-navy-900 text-white' : 'btn-secondary'}`}>{m === 'bulk' && <Users size={13} />}{t(`sms.mode_${m}`)}</button>)}</div>
          {mode === 'single' ? <Field label={t('sms.recipients')} hint={t('sms.recipientsHint')}><Textarea dir="ltr" rows={2} value={mobiles} onChange={(e) => setMobiles(e.target.value)} placeholder="01xxxxxxxxx, 01xxxxxxxxx" /></Field> : (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t('common.compound')}><Select value={compoundId} onChange={(e) => setCompoundId(e.target.value)}><option value="">{t('dashboard.allCompounds')}</option>{lookups?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label={t('subs.title')}><div className="flex flex-wrap gap-1.5 pt-1">{(lookups?.subscriptionStatuses || []).map((s) => <button type="button" key={s} onClick={() => setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])} className={`rounded-lg px-2 py-1 text-xs border ${statuses.includes(s) ? 'bg-navy-900 text-white border-navy-900' : 'border-slate-300'}`}>{t(`status.${s}`)}</button>)}</div></Field>
            </div>)}
          <Field label={t('sms.message')} hint={`${message.length} / 600`}><Textarea rows={4} dir="auto" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        </div>)}
    </Modal>
  );
}

function TemplateEdit({ tpl, onClose, onSaved }) {
  const { t } = useI18n(); const toast = useToast(); const [body, setBody] = useState(tpl.body); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await api.put(`/admin/settings/sms-templates/${tpl.id}`, { body }); toast.success(t('common.success')); onSaved(); onClose(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return <Modal open onClose={onClose} title={`${tpl.key} · ${tpl.lang.toUpperCase()}`} footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />}{t('common.save')}</button></>}><Textarea rows={6} dir="auto" value={body} onChange={(e) => setBody(e.target.value)} /><p className="text-xs text-slate-500 mt-2">{body.length} chars</p></Modal>;
}
