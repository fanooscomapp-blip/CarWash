import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shuffle, Plus, XCircle, MapPin, Camera, Clock, AlertTriangle, Inbox, CalendarOff, GripVertical, UserRound, BarChart3, Sparkles } from 'lucide-react';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime, todayISO, addDaysISO } from '../lib/format.js';
import { PageHeader, Select, Modal, Field, Input, Spinner, useToast, ConfirmDialog, StatusBadge, AsyncSelect, Loading, ErrorBox } from '../components/ui.jsx';
import { PlateEG, ColoredCar, BrandBadge, mapsLink } from '../components/CarVisuals.jsx';

function AuthImage({ src, className }) {
  const [url, setUrl] = useState(null);
  useState(() => { api.get(src, { responseType: 'blob' }).then((r) => setUrl(URL.createObjectURL(r.data))).catch(() => {}); });
  return url ? <img src={url} alt="" className={className} onClick={() => window.open(url, '_blank')} /> : <span className={`${className} bg-slate-100 inline-block animate-pulse`} />;
}

function TaskDetailModal({ taskId, onClose, outcomeLabel }) {
  const { t, lang } = useI18n();
  const { data: d, loading } = useQuery(`/admin/staff/board/tasks/${taskId}`);
  const photos = (ph) => (d?.photos || []).filter((p) => p.phase === ph);
  const dur = d ? durationMin(d.start_time, d.end_time) : null;
  return (
    <Modal open onClose={onClose} title={d ? `${d.plate_number} · ${d.unit_number}` : '…'} size="lg">
      {loading || !d ? <Loading rows={4} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><PlateEG plate={d.plate_number} size="md" /><ColoredCar type={d.vehicle_type} color={d.color} className="h-9 w-18" /><BrandBadge brand={d.brand} model={d.model} /><StatusBadge status={d.status === 'skipped' ? 'issue_reported' : d.status} label={d.status === 'skipped' ? outcomeLabel(d.outcome) : undefined} /></div>
          <dl className="grid sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-xs text-slate-500">{t('common.owner')}</dt><dd className="font-medium">{d.owner_name} <span className="text-xs text-slate-400" dir="ltr">{d.owner_mobile}</span></dd></div>
            <div><dt className="text-xs text-slate-500">{t('common.compound')}</dt><dd className="font-medium">{d.compound_name}{d.parking_location ? ` · ${d.parking_location}` : ''}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('nav.staff')}</dt><dd className="font-medium">{d.staff_name || t('ops.pool')}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('common.date')}</dt><dd className="font-medium">{fmtDate(d.date)}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('ops.started')}</dt><dd className="font-medium">{d.start_time ? fmtDateTime(d.start_time) : '—'}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('ops.finished')}</dt><dd className="font-medium">{d.end_time ? fmtDateTime(d.end_time) : '—'}{dur !== null && <span className="ms-2 inline-flex items-center gap-1 text-slate-500"><Clock size={12} />{dur} {t('ops.min')}</span>}</dd></div>
          </dl>
          {(d.outcome_note || d.issue_description || d.notes || d.cancel_reason) && <p className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800">{d.cancel_reason || d.outcome_note || d.issue_description || d.notes}</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            {['before', 'after'].map((ph) => <div key={ph}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t(`ops.${ph}`)} ({photos(ph).length})</p>
              <div className="grid grid-cols-2 gap-2">{photos(ph).map((p) => <AuthImage key={p.id} src={`/admin/wash-records/photos/${p.id}`} className="aspect-square w-full rounded-lg object-cover cursor-zoom-in" />)}{!photos(ph).length && <div className="aspect-square rounded-lg bg-slate-50 border border-dashed border-slate-200 grid place-items-center text-xs text-slate-400 col-span-2">—</div>}</div></div>)}
          </div>
          <div className="text-end"><Link to={`/vehicles/${d.vehicle_id}`} className="text-sm text-brand-600 hover:underline">{t('common.vehicle')} →</Link></div>
        </div>
      )}
    </Modal>
  );
}

const durationMin = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);

function AddTaskModal({ date, staff, onClose, onSaved }) {
  const { t } = useI18n(); const toast = useToast();
  const [vehicle, setVehicle] = useState(null); const [userId, setUserId] = useState(''); const [busy, setBusy] = useState(false);
  const fetchVehicles = useCallback(async (q) => (await api.get('/admin/vehicles', { params: { search: q, pageSize: 10, status: 'active' } })).data.data, []);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/admin/staff/board/tasks', { vehicleId: vehicle.id, date, userId: userId || null }); toast.success(t('common.success')); onSaved(); onClose(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${t('ops.addTask')} — ${fmtDate(date)}`} footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="add-task" className="btn-primary" disabled={busy || !vehicle}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="add-task" onSubmit={submit} className="space-y-4">
        <Field label={t('common.vehicle')} required><AsyncSelect fetchOptions={fetchVehicles} value={vehicle} onChange={setVehicle} placeholder={t('ops.searchVehicle')} renderOption={(v) => <span><b dir="ltr">{v.plateNumber}</b> · {v.brand} · {v.unitNumber} · {v.ownerName} <span className="text-xs text-slate-400">{v.compoundName}</span></span>} /></Field>
        <Field label={t('ops.assignTo')}><Select value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">{t('ops.pool')}</option>{staff.filter((s) => !vehicle || (s.compound_ids || []).includes(vehicle.compoundId)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <p className="text-xs text-slate-500">{t('ops.addTaskHint')}</p>
      </form>
    </Modal>
  );
}


function TaskRow({ task, staffOptions, onMove, onCancel, canManage, t, dragging, setDragging, onOpen }) {
  const started = ['in_progress', 'completed'].includes(task.status);
  const dur = durationMin(task.start_time, task.end_time);
  const gps = mapsLink(task.gps_lat, task.gps_lng);
  const draggable = canManage && !started;
  return (
    <tr draggable={draggable} onDragStart={() => setDragging(task.id)} onDragEnd={() => setDragging(null)}
      className={`border-b border-slate-100 bg-white hover:bg-slate-50 ${dragging === task.id ? 'opacity-40' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <td className="px-2 py-2 w-8 text-slate-300">{draggable && <GripVertical size={16} />}</td>
      <td className="px-2 py-2"><button className="flex items-center gap-2 text-start" onClick={() => onOpen(task)}><PlateEG plate={task.plate_number} size="sm" /><ColoredCar type={task.vehicle_type} color={task.color} className="h-6 w-12" /></button></td>
      <td className="px-2 py-2"><div className="flex flex-col gap-1 items-start"><BrandBadge brand={task.brand} model={task.model} /><span className="chip bg-navy-900 text-white font-mono">{task.unit_number}</span></div></td>
      <td className="px-2 py-2 text-xs text-slate-600 max-w-[16rem]"><Link to={`/vehicles/${task.vehicle_id}`} className="font-medium text-slate-800 hover:underline">{task.owner_name}</Link><div className="truncate">{task.compound_name}{task.parking_location ? ` · ${task.parking_location}` : ''}{gps && <a href={gps} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline ms-1 inline-flex items-center gap-0.5"><MapPin size={11} />{t('ops.map')}</a>}</div></td>
      <td className="px-2 py-2 text-xs"><div className="flex flex-col items-start gap-1"><StatusBadge status={task.status === 'skipped' ? 'issue_reported' : task.status} label={task.status === 'skipped' ? (task.outcome_label || t('ops.skipped')) : undefined} /><span className="text-slate-500 flex items-center gap-2 whitespace-nowrap">{task.photos > 0 && <span className="inline-flex items-center gap-0.5"><Camera size={11} />{task.photos}</span>}{dur !== null && <span className="inline-flex items-center gap-0.5"><Clock size={11} />{dur} {t('ops.min')}</span>}<span>{task.washes_used}/{task.washes_allowed}</span></span></div></td>
      <td className="px-2 py-2 min-w-[10rem]">{canManage && !started ? (
        <select className="input !py-1 !text-xs min-w-[9rem]" value={task.assigned_to || ''} onChange={(e) => onMove(task, e.target.value || null)}>
          <option value="">{t('ops.pool')}</option>
          {staffOptions.filter((s) => (s.compound_ids || []).includes(task.compound_id) || s.id === task.assigned_to).map((s) => <option key={s.id} value={s.id}>{s.name}{s.on_leave ? ` (${t('staff.onLeave')})` : ''}</option>)}
        </select>) : <span className="text-xs text-slate-600">{task.staff_name || t('ops.pool')}</span>}</td>
      <td className="px-2 py-2 w-10 text-end">{canManage && !started && <button className="btn-ghost p-1.5 text-red-600" title={t('ops.cancelTask')} onClick={() => onCancel(task)}><XCircle size={15} /></button>}</td>
    </tr>
  );
}

function StaffTile({ title, subtitle, count, done, capacity, active, off, onClick, onDropTask, icon }) {
  const over_cap = capacity && count > capacity;
  const [over, setOver] = useState(false);
  return (
    <button onClick={onClick} onDragOver={(e) => { if (onDropTask) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onDropTask?.(); }}
      className={`w-full text-start rounded-xl border px-3 py-2 transition ${over ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : active ? 'border-navy-900 bg-navy-900 text-white' : off ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
      <div className="flex items-center gap-2">
        {icon}
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{title}</p>{subtitle && <p className={`text-[11px] truncate ${active ? 'text-white/70' : 'text-slate-500'}`}>{subtitle}</p>}</div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${active ? 'bg-white/20' : done === count && count ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{done !== undefined && count ? `${done}/` : ''}{count}{capacity ? <span className={`font-normal ${over_cap ? 'text-red-600' : 'opacity-60'}`}> / {capacity}</span> : null}</span>
      </div>
      {count > 0 && done !== undefined && <div className={`mt-1.5 h-1 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100'} overflow-hidden`}><div className="h-full bg-emerald-500" style={{ width: `${(done / count) * 100}%` }} /></div>}
    </button>
  );
}

function DayLoadCard({ compoundId, canManage }) {
  const { t } = useI18n(); const toast = useToast(); const days = t('common.weekdays');
  const { data, reload } = useQuery('/admin/subscriptions/day-loads', { compoundId }, { enabled: !!compoundId });
  const [busy, setBusy] = useState(false);
  if (!compoundId || !data) return null;
  const max = Math.max(1, ...Object.values(data.loads));
  const run = async () => { setBusy(true); try { const { data: r } = await api.post('/admin/subscriptions/auto-assign-days', { compoundId }); toast.success(t('washDays.autoAssigned', { n: r.count })); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <div className="card p-3 mb-4 flex flex-wrap items-end gap-4">
      <div className="flex-1 min-w-[16rem]"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1"><BarChart3 size={14} />{t('washDays.load')}</p>
        <div className="flex items-end gap-1.5 h-16">{[6, 0, 1, 2, 3, 4, 5].map((d) => <div key={d} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full"><span className="text-[10px] text-slate-600 font-semibold">{data.loads[d] || 0}</span><div className="w-full rounded-t bg-brand-500/80" style={{ height: `${Math.max(2, ((data.loads[d] || 0) / max) * 44)}px` }} /><span className="text-[10px] text-slate-400">{days[d].slice(0, 3)}</span></div>)}</div></div>
      {data.unbalanced > 0 && canManage && <div className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 max-w-sm"><p className="mb-1.5">{t('washDays.autoAssignHint', { n: data.unbalanced })}</p><button className="btn-primary btn-sm" disabled={busy} onClick={run}>{busy ? <Spinner /> : <Sparkles size={14} />}{t('washDays.autoAssign')}</button></div>}
    </div>
  );
}

export default function Operations() {
  const { t, lang } = useI18n(); const { can } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || ''; const compoundId = params.get('compoundId') || ''; const focus = params.get('staff') || '';
  const setP = (patch) => { const n = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setParams(n, { replace: true }); };
  const lookups = useLookups();
  const { data, loading, error, reload } = useQuery('/admin/staff/board', { date: date || undefined, compoundId });
  const shownDate = date || data?.today || todayISO();
  const [detail, setDetail] = useState(null); const [dragging, setDragging] = useState(null); const [cancel, setCancel] = useState(null); const [cancelBusy, setCancelBusy] = useState(false); const [adding, setAdding] = useState(false); const [distBusy, setDistBusy] = useState(false); const [showLoad, setShowLoad] = useState(false);
  const canManage = can('operations.manage');
  const today = data?.today || todayISO(), tomorrow = addDaysISO(today, 1);
  const outcomes = useQuery('/admin/settings', {}, { enabled: can('settings.manage') });
  const outcomeLabel = (key) => { const o = (outcomes.data?.settings?.outcomes || []).find((x) => x.key === key); return o ? (lang === 'ar' ? o.labelAr : o.labelEn) : key; };

  const staff = useMemo(() => (data?.staff || []).filter((s) => !compoundId || (s.compound_ids || []).includes(compoundId)), [data, compoundId]);
  const staffName = (id) => staff.find((s) => s.id === id)?.name;
  const tasks = useMemo(() => (data?.tasks || []).map((x) => ({ ...x, outcome_label: x.outcome ? outcomeLabel(x.outcome) : null, staff_name: staffName(x.assigned_to) })), [data, outcomes.data, lang, staff]); // eslint-disable-line react-hooks/exhaustive-deps
  const pool = tasks.filter((x) => !x.assigned_to);
  const byStaff = (id) => tasks.filter((x) => x.assigned_to === id);
  const doneOf = (list) => list.filter((x) => ['completed', 'skipped'].includes(x.status)).length;
  const totals = { total: tasks.length, done: tasks.filter((x) => x.status === 'completed').length, running: tasks.filter((x) => x.status === 'in_progress').length, skipped: tasks.filter((x) => x.status === 'skipped').length };

  const move = async (task, userId) => { try { await api.post(`/admin/staff/board/tasks/${task.id}/assign`, { userId }); reload(); } catch (e) { toast.error(e.message); } };
  const distribute = async (cid) => { setDistBusy(true); try { const { data: r } = await api.post('/admin/staff/board/distribute', { date: shownDate, compoundId: cid || undefined }); const a = r.reduce((s, x) => s + x.assigned, 0), p = r.reduce((s, x) => s + x.pooled, 0); toast.success(t('ops.distributed', { a, p })); reload(); } catch (e) { toast.error(e.message); } finally { setDistBusy(false); } };
  const doCancel = async (reason) => { setCancelBusy(true); try { await api.post(`/admin/staff/board/tasks/${cancel.id}/cancel`, { reason }); setCancel(null); reload(); } catch (e) { toast.error(e.message); } finally { setCancelBusy(false); } };
  const dropOn = (userId) => { const task = tasks.find((x) => x.id === dragging); setDragging(null); if (task && task.assigned_to !== userId) move(task, userId); };

  // Groups shown in the main list: pool + each staff (or just the focused one)
  const groups = [{ id: '', name: t('ops.pool'), list: pool, pool: true }, ...staff.map((s) => ({ id: s.id, name: s.name, list: byStaff(s.id), off: s.on_leave || !s.works_today, s }))].filter((g) => (focus ? (focus === 'pool' ? g.pool : g.id === focus) : g.list.length > 0 || g.pool));
  const rowProps = { staffOptions: staff, onMove: move, onCancel: setCancel, canManage, t, dragging, setDragging, onOpen: (x) => setDetail(x.id) };

  return (
    <div>
      <PageHeader title={t('ops.title')} subtitle={t('ops.subtitle')} actions={<>
        <button className="btn-secondary" onClick={() => setShowLoad((v) => !v)}><BarChart3 size={16} />{t('washDays.load')}</button>
        {canManage && <button className="btn-secondary" onClick={() => setAdding(true)}><Plus size={16} />{t('ops.addTask')}</button>}
        {canManage && <button className="btn-primary" disabled={distBusy} onClick={() => distribute(compoundId)}>{distBusy ? <Spinner /> : <Shuffle size={16} />}{t('ops.distribute')}</button>}
      </>} />

      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          {[[today, `${t('common.today')} · ${t('common.weekdays')[new Date(today + 'T00:00:00').getDay()]}`], [tomorrow, `${t('ops.tomorrow')} · ${t('common.weekdays')[new Date(tomorrow + 'T00:00:00').getDay()]}`]].map(([d, label]) => <button key={d} onClick={() => setP({ date: d })} className={`px-3 py-1.5 text-sm font-medium ${shownDate === d ? 'bg-navy-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
        </div>
        <Input type="date" value={shownDate} onChange={(e) => setP({ date: e.target.value })} className="!w-auto" />
        <Select value={compoundId} onChange={(e) => setP({ compoundId: e.target.value, staff: '' })} className="!w-auto"><option value="">{t('ops.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <div className="ms-auto flex flex-wrap gap-2 text-xs">
          <span className="chip bg-slate-100 text-slate-700">{t('ops.tasks')}: <b>{totals.total}</b></span>
          <span className="chip bg-emerald-50 text-emerald-700">{t('status.completed')}: <b>{totals.done}</b></span>
          <span className="chip bg-blue-50 text-blue-700">{t('status.in_progress')}: <b>{totals.running}</b></span>
          {totals.skipped > 0 && <span className="chip bg-orange-50 text-orange-700">{t('ops.skipped')}: <b>{totals.skipped}</b></span>}
        </div>
      </div>

      {showLoad && (compoundId ? <DayLoadCard compoundId={compoundId} canManage={can('subscriptions.manage')} /> : <p className="mb-4 text-sm text-slate-500">{t('washDays.pickCompound')}</p>)}

      {!!data?.pendingEligible?.length && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">{t('ops.pendingEligible')}: {data.pendingEligible.map((p) => `${p.compoundName} (${p.count})`).join(' · ')}</span>
          {canManage && <button className="btn-primary btn-sm" disabled={distBusy} onClick={() => distribute(compoundId)}><Shuffle size={14} />{t('ops.distributeNow')}</button>}
        </div>
      )}

      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <div className="grid lg:grid-cols-[15rem_1fr] gap-4 items-start">
          {/* Staff panel: sticky, drop targets + filter */}
          <aside className="lg:sticky lg:top-20 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1">{t('ops.dropHint')}</p>
            <StaffTile title={t('ops.all')} count={tasks.length} active={!focus} onClick={() => setP({ staff: '' })} />
            <StaffTile title={t('ops.pool')} subtitle={t('ops.poolHint')} count={pool.length} active={focus === 'pool'} onClick={() => setP({ staff: focus === 'pool' ? '' : 'pool' })} onDropTask={canManage ? () => dropOn(null) : null} icon={<Inbox size={16} className="text-slate-400" />} />
            {staff.map((s) => { const mine = byStaff(s.id); const off = s.on_leave || !s.works_today; return (
              <StaffTile key={s.id} title={s.name} subtitle={s.on_leave ? t('staff.onLeave') : !s.works_today ? t('ops.dayOff') : s.employee_code} count={mine.length} done={doneOf(mine)} capacity={s.daily_capacity || data?.defaultCapacity} off={off} active={focus === s.id} onClick={() => setP({ staff: focus === s.id ? '' : s.id })} onDropTask={canManage ? () => dropOn(s.id) : null} icon={off ? <CalendarOff size={16} className="text-slate-400" /> : <UserRound size={16} className={focus === s.id ? 'text-white/80' : 'text-slate-400'} />} />); })}
            {!staff.length && <button className="btn-secondary btn-sm w-full" onClick={() => navigate('/staff')}>{t('ops.noStaff')} →</button>}
          </aside>

          {/* Task list grouped by staff */}
          <div className="card overflow-hidden">
            {!tasks.length && <div className="py-16 text-center text-slate-500"><Inbox size={32} className="mx-auto text-slate-300 mb-2" /><p>{t('ops.noTasks')}</p></div>}
            {tasks.length > 0 && <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="w-8" /><th className="px-2 py-2 text-start">{t('common.vehicle')}</th><th className="px-2 py-2 text-start">{t('common.unit')}</th><th className="px-2 py-2 text-start">{t('common.owner')} · {t('common.location')}</th><th className="px-2 py-2 text-start">{t('common.status')}</th><th className="px-2 py-2 text-start">{t('nav.staff')}</th><th /></tr></thead>
              {groups.map((g) => (
                <tbody key={g.id || 'pool'}>
                  <tr className={`${g.pool ? 'bg-amber-50/60' : 'bg-slate-100/80'}`}><td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-slate-700"><div className="flex items-center gap-2">{g.pool ? <Inbox size={13} /> : <UserRound size={13} />}{g.name}<span className="font-normal text-slate-500">· {g.list.length}{!g.pool && g.list.length ? ` · ${doneOf(g.list)} ${t('status.completed').toLowerCase()}` : ''}</span>{g.off && <span className="chip bg-slate-200 text-slate-600">{g.s?.on_leave ? t('staff.onLeave') : t('ops.dayOff')}</span>}</div></td></tr>
                  {g.list.map((x) => <TaskRow key={x.id} task={x} {...rowProps} />)}
                  {!g.list.length && <tr><td colSpan={7} className="px-3 py-3 text-center text-xs text-slate-400">—</td></tr>}
                </tbody>
              ))}
            </table>}
          </div>
        </div>
      )}

      {!!data?.runs?.length && <div className="card p-4 mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('ops.runs')}</p>
        <ul className="text-xs text-slate-600 space-y-1">{data.runs.map((r) => <li key={r.id}>{fmtDateTime(r.createdAt)} · <b>{t(`ops.trigger.${r.trigger}`)}</b>{r.compound_name && ` · ${r.compound_name}`}{r.summary?.assigned !== undefined && ` · ${r.summary.eligible} → ${r.summary.assigned} ${t('ops.assignedN')}${r.summary.pooled ? `, ${r.summary.pooled} ${t('ops.pool').toLowerCase()}` : ''}`}{r.summary?.moved && ` · ${t('staff.movedTasks', { n: r.summary.total })}`}</li>)}</ul></div>}

      {detail && <TaskDetailModal taskId={detail} onClose={() => setDetail(null)} outcomeLabel={outcomeLabel} />}
      {adding && <AddTaskModal date={shownDate} staff={staff} onClose={() => setAdding(false)} onSaved={reload} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} loading={cancelBusy} danger title={t('ops.cancelTask')} message={cancel && `${cancel.plate_number} · ${cancel.unit_number}`} reasonLabel={t('common.reason')} confirmLabel={t('common.confirm')} />
    </div>
  );
}
