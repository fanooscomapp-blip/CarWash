import { useState } from 'react';
import { Plus, Pencil, CalendarOff, UserX, KeyRound, Trash2 } from 'lucide-react';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate, todayISO } from '../lib/format.js';
import { PageHeader, DataTable, Modal, Field, Input, Spinner, useToast, Toggle, ConfirmDialog, StatusBadge, Select, DeleteButton } from '../components/ui.jsx';

const WEEK = [6, 0, 1, 2, 3, 4, 5];

/** Weekly schedule grid: rows = compounds the washer serves, columns = days, cell = cars he can take there that day (blank = off). */
function ScheduleGrid({ value, onChange, compounds, defaultCap }) {
  const { t } = useI18n(); const days = t('common.weekdays');
  const rowsC = [...new Set(value.map((c) => c.compoundId))];
  const [adding, setAdding] = useState('');
  const cell = (cid, dow) => value.find((c) => c.compoundId === cid && c.dow === dow)?.capacity ?? '';
  const setCell = (cid, dow, v) => { const n = value.filter((c) => !(c.compoundId === cid && c.dow === dow)); const num = Number(v); if (v !== '' && num > 0) n.push({ compoundId: cid, dow, capacity: num }); onChange(n); };
  const fillRow = (cid, cap) => onChange([...value.filter((c) => c.compoundId !== cid), ...WEEK.filter((d) => d !== 5).map((dow) => ({ compoundId: cid, dow, capacity: cap }))]);
  const removeRow = (cid) => onChange(value.filter((c) => c.compoundId !== cid));
  const dayTotal = (dow) => value.filter((c) => c.dow === dow).reduce((a, c) => a + c.capacity, 0);
  const free = compounds.filter((c) => !rowsC.includes(c.id));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5 text-start font-semibold">{t('common.compound')}</th>{WEEK.map((d) => <th key={d} className={`px-1 py-1.5 font-semibold ${d === 5 ? 'text-slate-300' : ''}`}>{days[d].slice(0, 3)}</th>)}<th /></tr></thead>
          <tbody>
            {rowsC.map((cid) => { const c = compounds.find((x) => x.id === cid); return (
              <tr key={cid} className="border-t border-slate-100">
                <td className="px-2 py-1 font-medium text-slate-800 whitespace-nowrap">{c?.name || '?'}<button type="button" className="ms-2 text-[10px] text-brand-600 hover:underline" onClick={() => fillRow(cid, defaultCap)}>{t('staff.fillRow', { n: defaultCap })}</button></td>
                {WEEK.map((d) => <td key={d} className="px-0.5 py-1"><input type="number" min="0" max="500" dir="ltr" value={cell(cid, d)} onChange={(e) => setCell(cid, d, e.target.value)} placeholder="–" className={`w-12 rounded-md border px-1 py-1 text-center ${cell(cid, d) !== '' ? 'border-navy-900 bg-navy-900 text-white font-semibold' : 'border-slate-200 bg-white text-slate-400'}`} /></td>)}
                <td className="px-1"><button type="button" className="text-slate-400 hover:text-red-600" onClick={() => removeRow(cid)} title={t('common.delete')}><Trash2 size={13} /></button></td>
              </tr>); })}
            {rowsC.length > 0 && <tr className="border-t border-slate-200 bg-slate-50 text-slate-600"><td className="px-2 py-1 font-semibold">{t('staff.dayTotal')}</td>{WEEK.map((d) => <td key={d} className="px-1 py-1 text-center font-semibold">{dayTotal(d) || '–'}</td>)}<td /></tr>}
            {!rowsC.length && <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-400">{t('staff.noSchedule')}</td></tr>}
          </tbody>
        </table>
      </div>
      {free.length > 0 && <div className="flex items-center gap-2"><Select value={adding} onChange={(e) => setAdding(e.target.value)} className="!w-auto !py-1 !text-xs"><option value="">{t('staff.addCompound')}</option>{free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><button type="button" className="btn-secondary btn-sm" disabled={!adding} onClick={() => { fillRow(adding, defaultCap); setAdding(''); }}>{t('common.add')}</button></div>}
      <p className="text-[11px] text-slate-500">{t('staff.scheduleHint')}</p>
    </div>
  );
}

function StaffForm({ open, onClose, initial, onSaved, defaultCap = 32 }) {
  const { t } = useI18n(); const toast = useToast(); const lookups = useLookups();
  const [form, setForm] = useState({ name: initial?.name || '', mobile: initial?.mobile || '', employeeCode: initial?.employee_code || '', pin: '', schedule: initial?.schedule || [], isActive: initial?.is_active ?? true, workHoursPerDay: initial?.work_hours_per_day ?? '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    if (!form.schedule.length) { setError(t('staff.noSchedule')); setBusy(false); return; }
    try {
      const payload = { name: form.name, mobile: form.mobile || null, employeeCode: form.employeeCode, schedule: form.schedule, isActive: form.isActive, workHoursPerDay: form.workHoursPerDay === '' ? null : Number(form.workHoursPerDay) }; if (form.pin) payload.pin = form.pin;
      if (initial?.id) await api.put(`/admin/staff/${initial.id}`, payload); else await api.post('/admin/staff', payload);
      toast.success(t('common.success')); onSaved?.(); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('staff.edit') : t('staff.add')} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="staff-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="staff-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label={t('common.name')} required><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('common.mobile')}><Input dir="ltr" value={form.mobile} onChange={set('mobile')} /></Field>
        <Field label={t('users.employeeCode')} required hint={t('staff.codeHint')}><Input required dir="ltr" value={form.employeeCode} onChange={set('employeeCode')} /></Field>
        <Field label={initial?.id ? t('staff.newPin') : t('staff.pin')} required={!initial?.id} hint={t('staff.pinHint')}><Input dir="ltr" inputMode="numeric" pattern="\d{4,6}" required={!initial?.id} value={form.pin} onChange={set('pin')} autoComplete="off" /></Field>
        <Field label={t('staff.hoursPerDay')}><Input type="number" min="0" max="24" step="0.5" dir="ltr" value={form.workHoursPerDay} onChange={set('workHoursPerDay')} placeholder="8" /></Field>
        <div className="flex items-end pb-2"><Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} /></div>
        <Field label={t('staff.schedule')} className="sm:col-span-2"><ScheduleGrid value={form.schedule} onChange={(v) => setForm({ ...form, schedule: v })} compounds={lookups.data?.activeCompounds || []} defaultCap={defaultCap} /></Field>
        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

function LeaveModal({ staff, onClose, onSaved }) {
  const { t } = useI18n(); const toast = useToast();
  const [form, setForm] = useState({ startDate: todayISO(), endDate: todayISO(), reason: '' }); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post(`/admin/staff/${staff.id}/leaves`, form); setResult(data); toast.success(t('common.success')); onSaved?.(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const remove = async (id) => { try { await api.delete(`/admin/staff/${staff.id}/leaves/${id}`); toast.success(t('common.deleted')); onSaved?.(); onClose(); } catch (err) { toast.error(err.message); } };
  return (
    <Modal open onClose={onClose} title={`${t('staff.leaves')} — ${staff.name}`}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>{!result && <button form="leave-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('staff.addLeave')}</button>}</>}>
      {result ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <p className="font-medium">{t('staff.leaveSaved')}</p>
          {result.moves.length ? result.moves.map((m) => <p key={m.date}>{fmtDate(m.date)}: {t('staff.movedTasks', { n: m.total })} {Object.entries(m.moved).map(([n, c]) => `${n} +${c}`).join(', ')}{m.pooled ? ` · ${t('staff.pooled', { n: m.pooled })}` : ''}</p>) : <p>{t('staff.noTasksMoved')}</p>}
        </div>
      ) : (
        <form id="leave-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
          <Field label={t('common.from')} required><Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} /></Field>
          <Field label={t('common.to')} required><Input type="date" required min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          <Field label={t('common.reason')} className="sm:col-span-2"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <p className="sm:col-span-2 text-xs text-slate-500">{t('staff.leaveHint')}</p>
        </form>
      )}
      {!!staff.leaves?.length && <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('staff.upcomingLeaves')}</p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{staff.leaves.map((l) => <li key={l.id} className="flex items-center justify-between px-3 py-2 text-sm"><span>{fmtDate(l.startDate)}{l.endDate !== l.startDate && ` → ${fmtDate(l.endDate)}`}{l.reason && <span className="text-slate-500"> · {l.reason}</span>}</span><button className="text-slate-400 hover:text-red-600" onClick={() => remove(l.id)} title={t('common.delete')}><Trash2 size={14} /></button></li>)}</ul></div>}
    </Modal>
  );
}

export default function Staff() {
  const { t } = useI18n(); const { can } = useAuth(); const toast = useToast();
  const { data, loading, error, reload } = useQuery('/admin/staff');
  const settings = useQuery('/admin/settings', {}, { enabled: can('settings.manage') }); const defaultCap = settings.data?.settings?.assignment?.defaultCapacity || 32;
  const [modal, setModal] = useState(null); const [leave, setLeave] = useState(null); const [absent, setAbsent] = useState(null); const [absentBusy, setAbsentBusy] = useState(false);
  const days = t('common.weekdays');
  const markAbsent = async () => {
    setAbsentBusy(true);
    try { const { data: r } = await api.post(`/admin/staff/${absent.id}/absent-today`); toast.success(`${t('staff.absentDone')} · ${t('staff.movedTasks', { n: r.total })}`); setAbsent(null); reload(); } catch (e) { toast.error(e.message); } finally { setAbsentBusy(false); }
  };
  const columns = [
    { key: 'name', header: t('common.name'), render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500" dir="ltr">{r.employee_code}{r.mobile ? ` · ${r.mobile}` : ''}</p></div> },
    { key: 'schedule', header: t('staff.schedule'), render: (r) => <div className="space-y-0.5">{(r.compounds || []).map((c) => { const cells = (r.schedule || []).filter((x) => x.compoundId === c.id); return <div key={c.id} className="flex items-center gap-1"><span className="chip bg-slate-100 text-slate-700 w-28 truncate justify-start">{c.name}</span><div className="flex gap-0.5">{WEEK.map((d) => { const cap = cells.find((x) => x.dow === d)?.capacity; return <span key={d} title={`${days[d]} · ${cap || '—'}`} className={`rounded px-1 text-[10px] min-w-[1.6rem] text-center ${cap ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-300'}`}>{cap || days[d].slice(0, 2)}</span>; })}</div></div>; })}</div> },
    { key: 'status', header: t('staff.status'), render: (r) => !r.is_active ? <StatusBadge status="inactive" /> : r.on_leave_today ? <StatusBadge status="suspended" label={t('staff.onLeave')} /> : <StatusBadge status="active" /> },
    { key: 'today', header: t('staff.today'), render: (r) => <span className="text-sm">{r.done_today}/{r.tasks_today}</span> },
    { key: 'capacity', header: t('staff.capacityToday'), render: (r) => <span className="text-sm" dir="ltr">{r.tasks_today}/{r.capacity_today || '—'}{r.work_hours_per_day ? <span className="text-xs text-slate-400"> · {Number(r.work_hours_per_day)}h</span> : null}</span> },
    { key: 'pin', header: t('staff.pin'), render: (r) => <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${r.has_pin ? 'text-emerald-700' : 'text-red-600'}`}><KeyRound size={12} />{r.has_pin ? t('staff.pinSet') : t('staff.pinMissing')}</span> },
    { key: 'actions', header: '', render: (r) => can('staff.manage') && <div className="flex justify-end gap-1">
      {r.is_active && !r.on_leave_today && <button className="btn-secondary btn-sm text-red-700" onClick={(e) => { e.stopPropagation(); setAbsent(r); }} title={t('staff.absentToday')}><UserX size={14} />{t('staff.absentToday')}</button>}
      <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setLeave(r); }} title={t('staff.leaves')}><CalendarOff size={14} /></button>
      <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setModal(r); }} title={t('common.edit')}><Pencil size={14} /></button>
      <DeleteButton url={`/admin/users/${r.id}`} name={r.name} onDone={reload} />
    </div> },
  ];
  return (
    <div>
      <PageHeader title={t('staff.title')} subtitle={<>{t('staff.subtitle')} · <a className="text-brand-600 hover:underline" href="/s/login" target="_blank" rel="noreferrer" dir="ltr">{window.location.origin}/s</a></>} actions={can('staff.manage') && <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} />{t('staff.add')}</button>} />
      <div className="card"><DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={reload} emptyTitle={t('staff.empty')} /></div>
      {modal && <StaffForm open onClose={() => setModal(null)} initial={modal.id ? modal : null} onSaved={reload} defaultCap={defaultCap} />}
      {leave && <LeaveModal staff={leave} onClose={() => setLeave(null)} onSaved={reload} />}
      <ConfirmDialog open={!!absent} onClose={() => setAbsent(null)} onConfirm={markAbsent} loading={absentBusy} danger title={t('staff.absentToday')} message={absent && t('staff.absentConfirm', { name: absent.name })} confirmLabel={t('common.confirm')} />
    </div>
  );
}
