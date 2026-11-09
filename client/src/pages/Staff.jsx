import { useState } from 'react';
import { Plus, Pencil, CalendarOff, UserX, KeyRound, Trash2 } from 'lucide-react';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate, todayISO } from '../lib/format.js';
import { PageHeader, DataTable, Modal, Field, Input, Spinner, useToast, Toggle, ConfirmDialog, DaysPicker, StatusBadge } from '../components/ui.jsx';

function StaffForm({ open, onClose, initial, onSaved }) {
  const { t } = useI18n(); const toast = useToast(); const lookups = useLookups();
  const [form, setForm] = useState({ name: initial?.name || '', mobile: initial?.mobile || '', employeeCode: initial?.employee_code || '', pin: '', compoundIds: (initial?.compounds || []).map((c) => c.id), workDays: initial?.work_days || [6, 0, 1, 2, 3, 4], isActive: initial?.is_active ?? true, workHoursPerDay: initial?.work_hours_per_day ?? '', dailyCapacity: initial?.daily_capacity ?? '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = { ...form, mobile: form.mobile || null, workHoursPerDay: form.workHoursPerDay === '' ? null : Number(form.workHoursPerDay), dailyCapacity: form.dailyCapacity === '' ? null : Number(form.dailyCapacity) }; if (!payload.pin) delete payload.pin;
      if (initial?.id) await api.put(`/admin/staff/${initial.id}`, payload); else await api.post('/admin/staff', payload);
      toast.success(t('common.success')); onSaved?.(); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('staff.edit') : t('staff.add')}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="staff-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="staff-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label={t('common.name')} required><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('common.mobile')}><Input dir="ltr" value={form.mobile} onChange={set('mobile')} /></Field>
        <Field label={t('users.employeeCode')} required hint={t('staff.codeHint')}><Input required dir="ltr" value={form.employeeCode} onChange={set('employeeCode')} /></Field>
        <Field label={initial?.id ? t('staff.newPin') : t('staff.pin')} required={!initial?.id} hint={t('staff.pinHint')}><Input dir="ltr" inputMode="numeric" pattern="\d{4,6}" required={!initial?.id} value={form.pin} onChange={set('pin')} autoComplete="off" /></Field>
        <Field label={t('staff.hoursPerDay')}><Input type="number" min="0" max="24" step="0.5" dir="ltr" value={form.workHoursPerDay} onChange={set('workHoursPerDay')} placeholder="8" /></Field>
        <Field label={t('staff.capacity')} hint={t('staff.capacityHint')}><Input type="number" min="1" max="500" dir="ltr" value={form.dailyCapacity} onChange={set('dailyCapacity')} placeholder="32" /></Field>
        <Field label={t('staff.workDays')} className="sm:col-span-2"><DaysPicker value={form.workDays} onChange={(v) => setForm({ ...form, workDays: v })} /></Field>
        <Field label={t('users.compounds')} className="sm:col-span-2"><div className="flex flex-wrap gap-2">{lookups.data?.activeCompounds.map((c) => { const on = form.compoundIds.includes(c.id); return <button type="button" key={c.id} onClick={() => setForm({ ...form, compoundIds: on ? form.compoundIds.filter((x) => x !== c.id) : [...form.compoundIds, c.id] })} className={`btn btn-sm ${on ? 'bg-navy-900 text-white' : 'btn-secondary'}`}>{c.name}</button>; })}</div></Field>
        <div className="sm:col-span-2"><Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} /></div>
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
  const [modal, setModal] = useState(null); const [leave, setLeave] = useState(null); const [absent, setAbsent] = useState(null); const [absentBusy, setAbsentBusy] = useState(false);
  const days = t('common.weekdays');
  const markAbsent = async () => {
    setAbsentBusy(true);
    try { const { data: r } = await api.post(`/admin/staff/${absent.id}/absent-today`); toast.success(`${t('staff.absentDone')} · ${t('staff.movedTasks', { n: r.total })}`); setAbsent(null); reload(); } catch (e) { toast.error(e.message); } finally { setAbsentBusy(false); }
  };
  const columns = [
    { key: 'name', header: t('common.name'), render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500" dir="ltr">{r.employee_code}{r.mobile ? ` · ${r.mobile}` : ''}</p></div> },
    { key: 'compounds', header: t('users.compounds'), render: (r) => <div className="flex flex-wrap gap-1">{(r.compounds || []).map((c) => <span key={c.id} className="chip bg-slate-100 text-slate-700">{c.name}</span>)}</div> },
    { key: 'work_days', header: t('staff.workDays'), render: (r) => <div className="flex gap-0.5">{[6, 0, 1, 2, 3, 4, 5].map((d) => <span key={d} className={`rounded px-1 text-[10px] ${r.work_days.includes(d) ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-400'}`}>{days[d].slice(0, 2)}</span>)}</div> },
    { key: 'status', header: t('staff.status'), render: (r) => !r.is_active ? <StatusBadge status="inactive" /> : r.on_leave_today ? <StatusBadge status="suspended" label={t('staff.onLeave')} /> : <StatusBadge status="active" /> },
    { key: 'today', header: t('staff.today'), render: (r) => <span className="text-sm">{r.done_today}/{r.tasks_today}</span> },
    { key: 'capacity', header: t('staff.capacity'), render: (r) => <span className="text-sm" dir="ltr">{r.daily_capacity ?? '—'}{r.work_hours_per_day ? <span className="text-xs text-slate-400"> · {Number(r.work_hours_per_day)}h</span> : null}</span> },
    { key: 'pin', header: t('staff.pin'), render: (r) => <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${r.has_pin ? 'text-emerald-700' : 'text-red-600'}`}><KeyRound size={12} />{r.has_pin ? t('staff.pinSet') : t('staff.pinMissing')}</span> },
    { key: 'actions', header: '', render: (r) => can('staff.manage') && <div className="flex justify-end gap-1">
      {r.is_active && !r.on_leave_today && <button className="btn-secondary btn-sm text-red-700" onClick={(e) => { e.stopPropagation(); setAbsent(r); }} title={t('staff.absentToday')}><UserX size={14} />{t('staff.absentToday')}</button>}
      <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setLeave(r); }} title={t('staff.leaves')}><CalendarOff size={14} /></button>
      <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setModal(r); }} title={t('common.edit')}><Pencil size={14} /></button>
    </div> },
  ];
  return (
    <div>
      <PageHeader title={t('staff.title')} subtitle={<>{t('staff.subtitle')} · <a className="text-brand-600 hover:underline" href="/s/login" target="_blank" rel="noreferrer" dir="ltr">{window.location.origin}/s</a></>} actions={can('staff.manage') && <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} />{t('staff.add')}</button>} />
      <div className="card"><DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={reload} emptyTitle={t('staff.empty')} /></div>
      {modal && <StaffForm open onClose={() => setModal(null)} initial={modal.id ? modal : null} onSaved={reload} />}
      {leave && <LeaveModal staff={leave} onClose={() => setLeave(null)} onSaved={reload} />}
      <ConfirmDialog open={!!absent} onClose={() => setAbsent(null)} onConfirm={markAbsent} loading={absentBusy} danger title={t('staff.absentToday')} message={absent && t('staff.absentConfirm', { name: absent.name })} confirmLabel={t('common.confirm')} />
    </div>
  );
}
