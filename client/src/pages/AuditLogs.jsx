import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery, useDebounced } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { fmtDateTime } from '../lib/format.js';
import { PageHeader, SearchInput, Select, Input, Loading, ErrorBox, Empty, Pagination } from '../components/ui.jsx';

const ENTITIES = ['compound', 'unit', 'owner', 'vehicle', 'plan', 'subscription', 'payment', 'user', 'role', 'settings', 'company'];

function Diff({ before, after }) {
  const { t } = useI18n();
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])).filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]) && !['updatedAt', 'createdAt', 'passwordHash'].includes(k));
  if (!keys.length) return <pre className="text-xs bg-slate-50 rounded p-3 overflow-auto max-h-64" dir="ltr">{JSON.stringify(after || before, null, 2)}</pre>;
  return (
    <table className="text-xs w-full" dir="ltr"><thead><tr className="text-slate-500"><th className="text-left py-1 pr-3">Field</th><th className="text-left py-1 pr-3">{t('audit.before')}</th><th className="text-left py-1">{t('audit.after')}</th></tr></thead>
      <tbody>{keys.map((k) => <tr key={k} className="border-t border-slate-100"><td className="py-1 pr-3 font-mono text-slate-600">{k}</td><td className="py-1 pr-3 text-red-700 break-all">{JSON.stringify(before?.[k]) ?? '—'}</td><td className="py-1 text-emerald-700 break-all">{JSON.stringify(after?.[k]) ?? '—'}</td></tr>)}</tbody></table>
  );
}

export default function AuditLogs() {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState(''); const [f, setF] = useState({ action: '', entityType: '', dateFrom: '', dateTo: '' }); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useQuery('/admin/audit-logs', { search: q, ...f, page, pageSize: 50 });
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <div className="fade-in">
      <PageHeader title={t('audit.title')} />
      <div className="flex flex-wrap gap-2 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-64" />
        <Select value={f.action} onChange={set('action')} className="w-56"><option value="">{t('audit.action')}: {t('common.all')}</option>{(data?.actions || []).map((a) => <option key={a} value={a}>{a}</option>)}</Select>
        <Select value={f.entityType} onChange={set('entityType')} className="w-44"><option value="">{t('audit.entity')}: {t('common.all')}</option>{ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}</Select>
        <Input type="date" value={f.dateFrom} onChange={set('dateFrom')} className="w-40" /><Input type="date" value={f.dateTo} onChange={set('dateTo')} className="w-40" />
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : (
        <div className="card overflow-hidden">
          {loading && !data ? <Loading /> : !data.data.length ? <Empty /> : (
            <table className="table"><thead><tr><th>{t('audit.when')}</th><th>{t('audit.user')}</th><th>{t('audit.action')}</th><th>{t('audit.entity')}</th><th>{t('audit.ip')}</th><th /></tr></thead>
              <tbody>{data.data.map((a) => (
                <>
                  <tr key={a.id} className="cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <td className="whitespace-nowrap text-slate-600">{fmtDateTime(a.createdAt, lang)}</td>
                    <td>{a.userName || <span className="text-slate-400">{t('audit.system')}</span>}<p className="text-xs text-slate-400" dir="ltr">{a.userEmail}</p></td>
                    <td><span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">{a.action}</span></td>
                    <td className="text-xs">{a.entityType}<p className="font-mono text-[10px] text-slate-400" dir="ltr">{a.entityId}</p></td>
                    <td className="text-xs text-slate-500" dir="ltr">{a.ip}</td>
                    <td className="text-end">{(a.before || a.after) && (open === a.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}</td>
                  </tr>
                  {open === a.id && (a.before || a.after || a.reason) && <tr key={a.id + '-d'}><td colSpan={6} className="bg-slate-50/60">{a.reason && <p className="text-xs mb-2"><b>{t('common.reason')}:</b> {a.reason}</p>}<Diff before={a.before} after={a.after} /></td></tr>}
                </>
              ))}</tbody></table>
          )}
          <Pagination pagination={data?.pagination} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
