import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shuffle, Plus, XCircle, MapPin, Camera, Clock, AlertTriangle, Inbox, CalendarOff, ChevronDown } from 'lucide-react';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime, todayISO, addDaysISO } from '../lib/format.js';
import { PageHeader, Select, Modal, Field, Input, Spinner, useToast, ConfirmDialog, StatusBadge, AsyncSelect, Loading, ErrorBox } from '../components/ui.jsx';
import { PlateEG, ColoredCar, BrandBadge, mapsLink } from '../components/CarVisuals.jsx';

const durationMin = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);

function TaskCard({ task, staffOptions, onMove, onCancel, canManage, t, dragging, setDragging }) {
  const started = ['in_progress', 'completed'].includes(task.status);
  const dur = durationMin(task.start_time, task.end_time);
  const gps = mapsLink(task.gps_lat, task.gps_lng);
  return (
    <div draggable={canManage && !started} onDragStart={() => setDragging(task.id)} onDragEnd={() => setDragging(null)}
      className={`rounded-xl border bg-white p-3 shadow-sm transition ${dragging === task.id ? 'opacity-40' : ''} ${task.status === 'completed' ? 'border-emerald-200' : task.status === 'in_progress' ? 'border-blue-300' : task.status === 'skipped' ? 'border-orange-200' : 'border-slate-200'} ${canManage && !started ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <PlateEG plate={task.plate_number} size="sm" />
        <ColoredCar type={task.vehicle_type} color={task.color} className="h-7 w-14" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <BrandBadge brand={task.brand} model={task.model} />
        <span className="chip bg-navy-900 text-white font-mono">{task.unit_number}</span>
      </div>
      <p className="mt-1.5 text-xs text-slate-600 truncate"><Link to={`/vehicles/${task.vehicle_id}`} className="hover:underline">{task.owner_name}</Link> · {task.compound_name}</p>
      {(task.parking_location || gps) && <p className="mt-1 text-xs text-slate-500 flex items-center gap-1 truncate"><MapPin size={12} className="shrink-0" />{task.parking_location || ''}{gps && <a href={gps} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline ms-1">{t('ops.map')}</a>}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5"><StatusBadge status={task.status === 'skipped' ? 'issue_reported' : task.status} label={task.status === 'skipped' ? (task.outcome_label || t('ops.skipped')) : undefined} />{task.photos > 0 && <span className="inline-flex items-center gap-0.5 text-slate-500"><Camera size={12} />{task.photos}</span>}{dur !== null && <span className="inline-flex items-center gap-0.5 text-slate-500"><Clock size={12} />{dur} {t('ops.min')}</span>}</div>
        <span className="text-slate-400">{task.washes_used}/{task.washes_allowed}</span>
      </div>
      {canManage && !started && (
        <div className="mt-2 flex items-center gap-1">
          <div className="relative flex-1"><select className="input !py-1 !text-xs !pe-6 appearance-none" value="" onChange={(e) => e.target.value && onMove(task, e.target.value === '__pool' ? null : e.target.value)}>
            <option value="">{t('ops.moveTo')}</option>
            {task.assigned_to && <option value="__pool">{t('ops.pool')}</option>}
            {staffOptions.filter((s) => s.id !== task.assigned_to && (s.compound_ids || []).includes(task.compound_id)).map((s) => <option key={s.id} value={s.id}>{s.name}{s.on_leave ? ` (${t('staff.onLeave')})` : ''}</option>)}
          </select><ChevronDown size={12} className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div>
          <button className="btn-secondary btn-sm !px-1.5 text-red-600" title={t('common.cancel')} onClick={() => onCancel(task)}><XCircle size={14} /></button>
        </div>
      )}
    </div>
  );
}

function Column({ title, subtitle, tasks, tone = 'default', onDropTask, children, badge }) {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e) => { if (onDropTask) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onDropTask?.(); }}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border ${over ? 'border-brand-500 bg-brand-50/50' : tone === 'pool' ? 'border-dashed border-slate-300 bg-slate-50' : tone === 'off' ? 'border-slate-200 bg-slate-100/70' : 'border-slate-200 bg-slate-50/60'}`}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200/70">
        <div className="min-w-0"><p className="font-semibold text-sm text-navy-900 truncate">{title}</p>{subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}</div>
        {badge}
      </div>
      <div className="flex-1 space-y-2 p-2 min-h-24">{children}{!tasks.length && <p className="text-center text-xs text-slate-400 py-6">—</p>}</div>
    </div>
  );
}

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

export default function Operations() {
  const { t, lang } = useI18n(); const { can } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || todayISO(); const compoundId = params.get('compoundId') || '';
  const setP = (patch) => { const n = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setParams(n, { replace: true }); };
  const lookups = useLookups();
  const { data, loading, error, reload } = useQuery('/admin/staff/board', { date, compoundId });
  const [dragging, setDragging] = useState(null); const [cancel, setCancel] = useState(null); const [cancelBusy, setCancelBusy] = useState(false); const [adding, setAdding] = useState(false); const [distBusy, setDistBusy] = useState(false);
  const canManage = can('operations.manage');
  const today = todayISO(), tomorrow = addDaysISO(today, 1);
  const outcomes = useQuery('/admin/settings', {}, { enabled: can('settings.manage') });
  const outcomeLabel = (key) => { const o = (outcomes.data?.settings?.outcomes || []).find((x) => x.key === key); return o ? (lang === 'ar' ? o.labelAr : o.labelEn) : key; };

  const tasks = useMemo(() => (data?.tasks || []).map((x) => ({ ...x, outcome_label: x.outcome ? outcomeLabel(x.outcome) : null })), [data, outcomes.data, lang]);
  const staff = useMemo(() => (data?.staff || []).filter((s) => !compoundId || (s.compound_ids || []).includes(compoundId)), [data, compoundId]);
  const pool = tasks.filter((x) => !x.assigned_to);
  const byStaff = (id) => tasks.filter((x) => x.assigned_to === id);
  const totals = { total: tasks.length, done: tasks.filter((x) => x.status === 'completed').length, running: tasks.filter((x) => x.status === 'in_progress').length, skipped: tasks.filter((x) => x.status === 'skipped').length };

  const move = async (task, userId) => { try { await api.post(`/admin/staff/board/tasks/${task.id}/assign`, { userId }); reload(); } catch (e) { toast.error(e.message); } };
  const distribute = async (cid) => { setDistBusy(true); try { const { data: r } = await api.post('/admin/staff/board/distribute', { date, compoundId: cid || undefined }); const a = r.reduce((s, x) => s + x.assigned, 0), p = r.reduce((s, x) => s + x.pooled, 0); toast.success(t('ops.distributed', { a, p })); reload(); } catch (e) { toast.error(e.message); } finally { setDistBusy(false); } };
  const doCancel = async (reason) => { setCancelBusy(true); try { await api.post(`/admin/staff/board/tasks/${cancel.id}/cancel`, { reason }); setCancel(null); reload(); } catch (e) { toast.error(e.message); } finally { setCancelBusy(false); } };
  const dropOn = (userId) => { const task = tasks.find((x) => x.id === dragging); setDragging(null); if (task && task.assigned_to !== userId) move(task, userId); };

  return (
    <div>
      <PageHeader title={t('ops.title')} subtitle={t('ops.subtitle')} actions={<>
        {canManage && <button className="btn-secondary" onClick={() => setAdding(true)}><Plus size={16} />{t('ops.addTask')}</button>}
        {canManage && <button className="btn-primary" disabled={distBusy} onClick={() => distribute(compoundId)}>{distBusy ? <Spinner /> : <Shuffle size={16} />}{t('ops.distribute')}</button>}
      </>} />

      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          {[[today, t('common.today')], [tomorrow, t('ops.tomorrow')]].map(([d, label]) => <button key={d} onClick={() => setP({ date: d })} className={`px-3 py-1.5 text-sm font-medium ${date === d ? 'bg-navy-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
        </div>
        <Input type="date" value={date} onChange={(e) => setP({ date: e.target.value })} className="!w-auto" />
        <Select value={compoundId} onChange={(e) => setP({ compoundId: e.target.value })} className="!w-auto"><option value="">{t('ops.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <div className="ms-auto flex flex-wrap gap-2 text-xs">
          <span className="chip bg-slate-100 text-slate-700">{t('ops.tasks')}: <b>{totals.total}</b></span>
          <span className="chip bg-emerald-50 text-emerald-700">{t('status.completed')}: <b>{totals.done}</b></span>
          <span className="chip bg-blue-50 text-blue-700">{t('status.in_progress')}: <b>{totals.running}</b></span>
          {totals.skipped > 0 && <span className="chip bg-orange-50 text-orange-700">{t('ops.skipped')}: <b>{totals.skipped}</b></span>}
        </div>
      </div>

      {!!data?.pendingEligible?.length && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">{t('ops.pendingEligible')}: {data.pendingEligible.map((p) => `${p.compoundName} (${p.count})`).join(' · ')}</span>
          {canManage && <button className="btn-primary btn-sm" disabled={distBusy} onClick={() => distribute(compoundId)}><Shuffle size={14} />{t('ops.distributeNow')}</button>}
        </div>
      )}

      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
          <Column title={t('ops.pool')} subtitle={t('ops.poolHint')} tasks={pool} tone="pool" onDropTask={canManage ? () => dropOn(null) : null} badge={<span className="chip bg-slate-200 text-slate-700">{pool.length}</span>}>
            {pool.map((x) => <TaskCard key={x.id} task={x} staffOptions={staff} onMove={move} onCancel={setCancel} canManage={canManage} t={t} dragging={dragging} setDragging={setDragging} />)}
          </Column>
          {staff.map((s) => {
            const mine = byStaff(s.id); const done = mine.filter((x) => x.status === 'completed').length; const off = s.on_leave || !s.works_today;
            return (
              <Column key={s.id} title={s.name} subtitle={s.on_leave ? t('staff.onLeave') : !s.works_today ? t('ops.dayOff') : `${done}/${mine.length} ${t('status.completed').toLowerCase()}`} tasks={mine} tone={off ? 'off' : 'default'} onDropTask={canManage ? () => dropOn(s.id) : null}
                badge={off ? <CalendarOff size={16} className="text-slate-400" /> : <span className={`chip ${done === mine.length && mine.length ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{mine.length}</span>}>
                {mine.map((x) => <TaskCard key={x.id} task={x} staffOptions={staff} onMove={move} onCancel={setCancel} canManage={canManage} t={t} dragging={dragging} setDragging={setDragging} />)}
              </Column>
            );
          })}
          {!staff.length && <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-16"><Inbox size={32} className="text-slate-300 mb-2" /><p>{t('ops.noStaff')}</p><button className="btn-secondary btn-sm mt-3" onClick={() => navigate('/staff')}>{t('nav.staff')}</button></div>}
        </div>
      )}

      {!!data?.runs?.length && <div className="card p-4 mt-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('ops.runs')}</p>
        <ul className="text-xs text-slate-600 space-y-1">{data.runs.map((r) => <li key={r.id}>{fmtDateTime(r.createdAt)} · <b>{t(`ops.trigger.${r.trigger}`)}</b>{r.compound_name && ` · ${r.compound_name}`}{r.summary?.assigned !== undefined && ` · ${r.summary.eligible} → ${r.summary.assigned} ${t('ops.assignedN')}${r.summary.pooled ? `, ${r.summary.pooled} ${t('ops.pool').toLowerCase()}` : ''}`}{r.summary?.moved && ` · ${t('staff.movedTasks', { n: r.summary.total })}`}</li>)}</ul></div>}

      {adding && <AddTaskModal date={date} staff={staff} onClose={() => setAdding(false)} onSaved={reload} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} loading={cancelBusy} danger title={t('ops.cancelTask')} message={cancel && `${cancel.plate_number} · ${cancel.unit_number}`} reasonLabel={t('common.reason')} confirmLabel={t('common.confirm')} />
    </div>
  );
}
