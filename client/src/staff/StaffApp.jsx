import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams, Link } from 'react-router-dom';
import { LogOut, Languages, MapPin, Camera, Play, CheckCircle2, Ban, ChevronLeft, ChevronRight, Lock, CarFront, AlertTriangle, CalendarClock, HelpCircle, WifiOff, RefreshCw, Hand, Clock, X, Loader2 } from 'lucide-react';
import { StaffProvider, useStaff, sapi, compressImage, useUploadQueue, AuthImg, fmtTime, useTicker, fmtClock } from './staffLib.jsx';
import { PlateEG, ColoredCar, BrandBadge, mapsLink } from '../components/CarVisuals.jsx';

// ───────── shared queue + optimistic task state ─────────
const QCtx = createContext(null);
function QueueProvider({ children }) {
  const q = useUploadQueue();
  const [local, setLocal] = useState({}); // taskId → { status, start_time, end_time, photosLocal: {before:[urls], after:[urls]} }
  const patchLocal = useCallback((id, patch) => setLocal((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } })), []);
  const clearLocal = useCallback((id) => setLocal((m) => { const n = { ...m }; delete n[id]; return n; }), []);
  const value = useMemo(() => ({ ...q, local, patchLocal, clearLocal }), [q, local, patchLocal, clearLocal]);
  return <QCtx.Provider value={value}>{children}</QCtx.Provider>;
}
const useQueue = () => useContext(QCtx);

const OUTCOME_ICON = { 'car-off': CarFront, lock: Lock, alert: AlertTriangle, calendar: CalendarClock };

// ───────── Login ─────────
function LoginPage() {
  const { t, login, lang, setLang, loggedIn } = useStaff(); const nav = useNavigate();
  const [code, setCode] = useState(''); const [pin, setPin] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (loggedIn) nav('/s', { replace: true }); }, [loggedIn, nav]);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const { data } = await sapi.post('/login', { employeeCode: code.trim(), pin }); login(data.token, data.user); nav('/s', { replace: true }); } catch (x) { setErr(x.status === 401 ? t('wrongLogin') : x.message); } finally { setBusy(false); } };
  return (
    <div className="min-h-dvh bg-navy-900 text-white flex flex-col">
      <div className="flex justify-end p-4"><button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="inline-flex items-center gap-1 text-sm opacity-80"><Languages size={16} />{lang === 'ar' ? 'English' : 'العربية'}</button></div>
      <form onSubmit={submit} className="flex-1 flex flex-col justify-center px-6 pb-16 max-w-sm w-full mx-auto">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-brand-600 shadow-lg"><CarFront size={40} /></div>
        <h1 className="text-center text-2xl font-bold mb-8">{t('appName')}</h1>
        <label className="block text-sm opacity-80 mb-1">{t('employeeCode')}</label>
        <input dir="ltr" className="w-full rounded-2xl bg-white/10 border border-white/20 px-4 py-4 text-xl text-center tracking-widest font-mono mb-4 focus:outline-none focus:border-brand-400" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="username" placeholder="EMP-001" />
        <label className="block text-sm opacity-80 mb-1">{t('pin')}</label>
        <input dir="ltr" type="password" inputMode="numeric" pattern="\d*" maxLength={6} className="w-full rounded-2xl bg-white/10 border border-white/20 px-4 py-4 text-3xl text-center tracking-[0.5em] font-mono mb-6 focus:outline-none focus:border-brand-400" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="current-password" placeholder="••••" />
        {err && <p className="text-center text-red-300 text-sm mb-4">{err}</p>}
        <button disabled={busy || !code || pin.length < 4} className="w-full rounded-2xl bg-brand-600 py-4 text-xl font-bold disabled:opacity-50 active:scale-[0.98] transition">{busy ? <Loader2 className="animate-spin mx-auto" /> : t('signIn')}</button>
      </form>
    </div>
  );
}

// ───────── Shell ─────────
function Shell({ children, title, back }) {
  const { t, user, logout, lang, setLang, online } = useStaff(); const q = useQueue(); const nav = useNavigate();
  const Back = lang === 'ar' ? ChevronRight : ChevronLeft;
  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col">
      <header className="sticky top-0 z-20 bg-navy-900 text-white px-3 py-3 flex items-center gap-2 shadow">
        {back ? <button onClick={() => nav(back)} className="p-1 -ms-1 rounded-lg hover:bg-white/10"><Back size={26} /></button> : <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600"><CarFront size={20} /></div>}
        <div className="flex-1 min-w-0"><p className="font-bold truncate">{title || user?.name}</p>{!title && <p className="text-[11px] opacity-70" dir="ltr">{user?.employeeCode}</p>}</div>
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="p-2 rounded-lg hover:bg-white/10 text-xs font-semibold">{lang === 'ar' ? 'EN' : 'ع'}</button>
        <button onClick={logout} className="p-2 rounded-lg hover:bg-white/10" title={t('logout')}><LogOut size={20} /></button>
      </header>
      {(!online || q.pending > 0) && (
        <div className={`px-4 py-2 text-sm flex items-center gap-2 ${!online ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900'}`}>
          {!online ? <WifiOff size={16} /> : <Loader2 size={16} className="animate-spin" />}
          <span className="flex-1">{!online ? t('offline') : q.lastError ? t('pending') : t('uploading')} {q.pending > 0 && `(${q.pending})`}</span>
          {q.lastError && <button onClick={q.retryNow} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={14} />{t('retry')}</button>}
        </div>
      )}
      <main className="flex-1 p-3 pb-24 max-w-lg w-full mx-auto">{children}</main>
    </div>
  );
}
function RequireStaff({ children }) { const { loggedIn } = useStaff(); return loggedIn ? children : <Navigate to="/s/login" replace />; }

// ───────── Task card (list) ─────────
function statusOf(task, local) { return { ...task, ...(local || {}) }; }
function TaskCard({ task, onClick, readOnly }) {
  const { t, lang } = useStaff(); const q = useQueue(); const x = statusOf(task, q.local[task.id]);
  const done = x.status === 'completed', running = x.status === 'in_progress', skipped = x.status === 'skipped', pool = !x.assigned_to;
  useTicker(running);
  const gps = mapsLink(x.gps_lat, x.gps_lng);
  return (
    <button onClick={onClick} className={`w-full text-start rounded-3xl border-2 bg-white p-3 shadow-sm active:scale-[0.99] transition ${done ? 'border-emerald-400' : running ? 'border-blue-500' : skipped ? 'border-orange-300' : pool ? 'border-dashed border-slate-300' : 'border-slate-200'}`}>
      <div className="flex items-center gap-3">
        <ColoredCar type={x.vehicle_type} color={x.color} className="h-12 w-24" />
        <div className="flex-1 min-w-0">
          <PlateEG plate={x.plate_number} size="md" />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><BrandBadge brand={x.brand} model={x.model} /><span className="rounded-md bg-navy-900 text-white font-mono font-bold text-sm px-2 py-0.5">{x.unit_number}</span></div>
        </div>
        <div className="text-end shrink-0">
          {done && <CheckCircle2 size={34} className="text-emerald-500" />}
          {running && <span className="inline-flex flex-col items-center text-blue-600"><Clock size={26} /><span className="font-mono text-sm font-bold">{fmtClock(Date.now() - new Date(x.start_time))}</span></span>}
          {skipped && <Ban size={32} className="text-orange-400" />}
          {pool && !readOnly && <Hand size={30} className="text-slate-400" />}
        </div>
      </div>
      {(x.parking_location || gps) && <p className="mt-2 text-sm text-slate-600 flex items-center gap-1.5"><MapPin size={16} className="text-brand-600 shrink-0" /><span className="truncate flex-1">{x.parking_location || x.compound_name}</span>{gps && <a href={gps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-lg bg-brand-50 text-brand-700 px-2 py-1 text-xs font-semibold">{t('map')}</a>}</p>}
      {!x.parking_location && !gps && <p className="mt-2 text-xs text-slate-500">{x.compound_name}</p>}
    </button>
  );
}

// ───────── Home: today / tomorrow ─────────
function HomePage() {
  const { t, me } = useStaff(); const q = useQueue(); const nav = useNavigate();
  const [data, setData] = useState(null); const [day, setDay] = useState('today'); const [err, setErr] = useState(null);
  const load = useCallback(async () => { try { const { data: d } = await sapi.get('/tasks'); setData(d); setErr(null); } catch (e) { setErr(e); } }, []);
  useEffect(() => { load(); const i = setInterval(load, 60000); const vis = () => document.visibilityState === 'visible' && load(); document.addEventListener('visibilitychange', vis); return () => { clearInterval(i); document.removeEventListener('visibilitychange', vis); }; }, [load]);
  useEffect(() => { if (q.pending === 0) load(); }, [q.pending, load]);
  const date = day === 'today' ? data?.today : data?.tomorrow;
  const list = (data?.tasks || []).filter((x) => x.date === date);
  const mine = list.filter((x) => x.assigned_to), pool = list.filter((x) => !x.assigned_to);
  const doneCount = mine.filter((x) => ['completed', 'skipped'].includes((q.local[x.id] || x).status)).length;
  const count = (d) => (data?.tasks || []).filter((x) => x.date === d && x.assigned_to).length;
  return (
    <Shell>
      <div className="grid grid-cols-2 gap-2 mb-3 rounded-2xl bg-white p-1.5 shadow-sm">
        {[['today', data?.today], ['tomorrow', data?.tomorrow]].map(([k, d]) => <button key={k} onClick={() => setDay(k)} className={`rounded-xl py-3 text-lg font-bold flex items-center justify-center gap-2 ${day === k ? 'bg-navy-900 text-white' : 'text-slate-600'}`}>{t(k)}<span className={`rounded-full px-2 text-sm ${day === k ? 'bg-white/20' : 'bg-slate-100'}`}>{count(d)}</span></button>)}
      </div>
      {day === 'today' && mine.length > 0 && <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"><div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / mine.length) * 100}%` }} /></div><span className="text-sm font-bold text-slate-700">{doneCount}/{mine.length} {t('done')}</span></div>}
      {day === 'tomorrow' && <p className="mb-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">{t('tomorrowView')}</p>}
      {err && !data && <p className="text-center text-red-600 py-8">{t('error')}</p>}
      {data && !list.length && <div className="text-center py-16 text-slate-500"><CarFront size={48} className="mx-auto text-slate-300 mb-3" /><p className="text-lg font-semibold">{t('noTasks')}</p><p className="text-sm">{t('noTasksHint')}</p></div>}
      <div className="space-y-3">{mine.map((x) => <TaskCard key={x.id} task={x} readOnly={day === 'tomorrow'} onClick={() => nav(`/s/task/${x.id}`)} />)}</div>
      {pool.length > 0 && <div className="mt-5"><p className="mb-2 px-1 text-sm font-bold text-slate-600 flex items-center gap-2"><Hand size={16} />{t('pool')} ({pool.length})</p><div className="space-y-3">{pool.map((x) => <TaskCard key={x.id} task={x} readOnly={day === 'tomorrow'} onClick={() => nav(`/s/task/${x.id}`)} />)}</div></div>}
    </Shell>
  );
}

// ───────── Photo strip with camera button ─────────
function PhotoStrip({ photos = [], localUrls = [], onAdd, label, disabled }) {
  const input = useRef();
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {!disabled && <button onClick={() => input.current?.click()} className="shrink-0 h-24 w-24 rounded-2xl border-2 border-dashed border-brand-400 bg-brand-50 text-brand-700 flex flex-col items-center justify-center gap-1 active:scale-95 transition"><Camera size={30} /><span className="text-xs font-bold">{label}</span></button>}
        {localUrls.map((u, i) => <img key={'l' + i} src={u} alt="" className="shrink-0 h-24 w-24 rounded-2xl object-cover" />)}
        {photos.map((p) => <AuthImg key={p.id} src={`/photos/${p.id}`} className="shrink-0 h-24 w-24 rounded-2xl object-cover" />)}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={async (e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) onAdd(await Promise.all(files.map((f) => compressImage(f)))); }} />
    </div>
  );
}

// ───────── Task detail + wash flow ─────────
function TaskPage() {
  const { id } = useParams(); const { t, me, lang, user } = useStaff(); const q = useQueue(); const nav = useNavigate();
  const [task, setTask] = useState(null); const [err, setErr] = useState(null); const [beforeFiles, setBeforeFiles] = useState([]); const [afterFiles, setAfterFiles] = useState([]); const [outcomeOpen, setOutcomeOpen] = useState(false); const [busy, setBusy] = useState(false); const [flash, setFlash] = useState('');
  const load = useCallback(async () => { try { const { data } = await sapi.get('/tasks'); const found = data.tasks.find((x) => x.id === id); if (!found) { nav('/s', { replace: true }); return; } setTask(found); setErr(null); } catch (e) { setErr(e); } }, [id, nav]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (q.pending === 0 && task) { load(); } }, [q.pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = task ? statusOf(task, q.local[id]) : null;
  useTicker(x?.status === 'in_progress');
  const minBefore = me?.photos?.minBefore ?? 1, minAfter = me?.photos?.minAfter ?? 1;
  const urls = useMemo(() => ({ before: beforeFiles.map((f) => URL.createObjectURL(f)), after: afterFiles.map((f) => URL.createObjectURL(f)) }), [beforeFiles, afterFiles]);
  useEffect(() => () => { [...urls.before, ...urls.after].forEach((u) => URL.revokeObjectURL(u)); }, [urls]);
  if (!x) return <Shell back="/s">{err ? <p className="text-center text-red-600 py-8">{t('error')}</p> : <div className="h-40 rounded-3xl bg-white animate-pulse" />}</Shell>;

  const isToday = x.date === me?.today || (!me && true); const mine = x.assigned_to === user?.id; const pool = !x.assigned_to;
  const havePhotos = (phase) => (x.photos || []).filter((p) => p.phase === phase).length;
  const canStart = isToday && mine && ['assigned', 'accepted'].includes(x.status) && beforeFiles.length + havePhotos('before') >= minBefore;
  const canFinish = isToday && mine && x.status === 'in_progress' && afterFiles.length + havePhotos('after') >= minAfter;
  const gps = mapsLink(x.gps_lat, x.gps_lng);
  const pos = () => new Promise((r) => { if (!navigator.geolocation) return r({}); navigator.geolocation.getCurrentPosition((p) => r({ lat: p.coords.latitude, lng: p.coords.longitude }), () => r({}), { timeout: 4000, maximumAge: 60000 }); });
  const form = (files, extra = {}) => { const fd = new FormData(); files.forEach((f) => fd.append('photos', f)); Object.entries(extra).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && fd.append(k, v)); return fd; };

  const claim = async () => { setBusy(true); try { await sapi.post(`/tasks/${id}/claim`); setFlash(t('claimed')); await load(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const start = async () => {
    const files = beforeFiles; const startedAt = new Date().toISOString(); setBeforeFiles([]);
    q.patchLocal(id, { status: 'in_progress', start_time: startedAt });
    const p = await pos();
    q.enqueue({ run: () => sapi.post(`/tasks/${id}/start`, form(files, p), { headers: { 'Content-Type': 'multipart/form-data' } }), onDone: () => { q.clearLocal(id); load(); }, onFail: (e) => { q.clearLocal(id); setBeforeFiles(files); setErr(e); } });
  };
  const finish = async () => {
    const files = afterFiles; setAfterFiles([]);
    q.patchLocal(id, { status: 'completed', end_time: new Date().toISOString() });
    const p = await pos();
    q.enqueue({ run: () => sapi.post(`/tasks/${id}/finish`, form(files, p), { headers: { 'Content-Type': 'multipart/form-data' } }), onDone: () => { q.clearLocal(id); load(); }, onFail: (e) => { q.clearLocal(id); setAfterFiles(files); setErr(e); } });
  };
  const outcome = async (def, note, files) => {
    setOutcomeOpen(false); q.patchLocal(id, { status: 'skipped', outcome: def.key });
    q.enqueue({ run: () => sapi.post(`/tasks/${id}/outcome`, form(files, { outcome: def.key, note }), { headers: { 'Content-Type': 'multipart/form-data' } }), onDone: () => { q.clearLocal(id); load(); }, onFail: (e) => { q.clearLocal(id); setErr(e); } });
  };
  const outcomeDef = (x.outcome && (me?.outcomes || []).find((o) => o.key === x.outcome)) || null;
  const outcomeLabel = outcomeDef ? (lang === 'ar' ? outcomeDef.labelAr : outcomeDef.labelEn) : x.outcome;

  return (
    <Shell back="/s" title={x.unit_number}>
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <PlateEG plate={x.plate_number} size="lg" className="!w-[13.5rem] max-w-[62%]" />
          <ColoredCar type={x.vehicle_type} color={x.color} className="h-12 w-24" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><BrandBadge brand={x.brand} model={x.model} className="!text-sm" /><span className="rounded-lg bg-navy-900 text-white font-mono font-bold text-lg px-3 py-1">{x.unit_number}</span><span className="text-sm text-slate-500">{x.compound_name}</span></div>
        <p className="mt-2 text-sm text-slate-600">{x.owner_name} · {t('washes')} {x.washes_used}/{x.washes_allowed}</p>
        {(x.parking_location || gps) && <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 p-3"><MapPin size={22} className="text-brand-600 shrink-0" /><span className="flex-1 text-base font-semibold text-slate-800">{x.parking_location || t('location')}</span>{gps && <a href={gps} target="_blank" rel="noreferrer" className="rounded-xl bg-brand-600 text-white px-3 py-2 text-sm font-bold">{t('map')}</a>}</div>}
      </div>

      {err && <div className="mt-3 rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2"><AlertTriangle size={18} className="shrink-0" /><span className="flex-1">{err.message || t('error')}</span><button onClick={() => setErr(null)}><X size={16} /></button></div>}
      {flash && <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700 font-semibold">{flash}</div>}

      {/* state: pool */}
      {pool && <button disabled={busy} onClick={claim} className="mt-4 w-full rounded-3xl bg-navy-900 text-white py-5 text-2xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"><Hand size={30} />{t('claim')}</button>}

      {/* state: assigned / accepted → before photos + start */}
      {mine && ['assigned', 'accepted'].includes(x.status) && (
        <div className="mt-4 space-y-3">
          <div className="rounded-3xl bg-white p-4 shadow-sm"><p className="mb-2 font-bold text-slate-700 flex items-center gap-2"><Camera size={18} />{t('photoBefore')} <span className="text-xs text-slate-400 font-normal">{t('needPhotos', { n: minBefore })}</span></p>
            <PhotoStrip label={t('addPhoto')} localUrls={urls.before} photos={(x.photos || []).filter((p) => p.phase === 'before')} onAdd={(f) => setBeforeFiles((a) => [...a, ...f])} disabled={!isToday} /></div>
          <button disabled={!canStart} onClick={start} className="w-full rounded-3xl bg-emerald-600 text-white py-5 text-2xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-40"><Play size={30} fill="currentColor" />{t('start')}</button>
          {isToday && <button onClick={() => setOutcomeOpen(true)} className="w-full rounded-3xl bg-white border-2 border-orange-300 text-orange-700 py-4 text-lg font-bold flex items-center justify-center gap-2"><Ban size={22} />{t('cantWash')}</button>}
        </div>
      )}

      {/* state: in progress → timer + after photos + finish */}
      {mine && x.status === 'in_progress' && (
        <div className="mt-4 space-y-3">
          <div className="rounded-3xl bg-blue-600 text-white p-5 text-center shadow"><p className="text-sm opacity-80">{t('timer')}</p><p className="font-mono text-6xl font-bold tabular-nums">{fmtClock(Date.now() - new Date(x.start_time))}</p><p className="text-xs opacity-70 mt-1">{t('startedAt')} {fmtTime(x.start_time, lang)}</p></div>
          <div className="rounded-3xl bg-white p-4 shadow-sm"><p className="mb-2 font-bold text-slate-700 flex items-center gap-2"><Camera size={18} />{t('photoAfter')} <span className="text-xs text-slate-400 font-normal">{t('needPhotos', { n: minAfter })}</span></p>
            <PhotoStrip label={t('addPhoto')} localUrls={urls.after} photos={(x.photos || []).filter((p) => p.phase === 'after')} onAdd={(f) => setAfterFiles((a) => [...a, ...f])} /></div>
          <button disabled={!canFinish} onClick={finish} className="w-full rounded-3xl bg-emerald-600 text-white py-5 text-2xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-40"><CheckCircle2 size={30} />{t('finish')}</button>
          <button onClick={() => setOutcomeOpen(true)} className="w-full rounded-3xl bg-white border-2 border-orange-300 text-orange-700 py-4 text-lg font-bold flex items-center justify-center gap-2"><Ban size={22} />{t('cantWash')}</button>
        </div>
      )}

      {/* state: completed / skipped */}
      {x.status === 'completed' && (
        <div className="mt-4 space-y-3">
          <div className="rounded-3xl bg-emerald-600 text-white p-5 text-center shadow"><CheckCircle2 size={40} className="mx-auto mb-1" /><p className="text-2xl font-bold">{t('washed')}</p>{x.start_time && x.end_time && <p className="mt-1 text-sm opacity-90">{t('duration')}: <b className="font-mono text-lg">{Math.round((new Date(x.end_time) - new Date(x.start_time)) / 60000)}</b> {t('min')} · {t('completedAt')} {fmtTime(x.end_time, lang)}</p>}</div>
          <PhotosRecap x={x} t={t} />
        </div>
      )}
      {x.status === 'skipped' && (
        <div className="mt-4 space-y-3">
          <div className="rounded-3xl bg-orange-500 text-white p-5 text-center shadow"><Ban size={40} className="mx-auto mb-1" /><p className="text-2xl font-bold">{outcomeLabel || t('skipped')}</p>{x.outcome_note && <p className="text-sm mt-1 opacity-90">{x.outcome_note}</p>}</div>
          <PhotosRecap x={x} t={t} />
        </div>
      )}

      {outcomeOpen && <OutcomeSheet onClose={() => setOutcomeOpen(false)} onPick={outcome} existingPhotos={(x.photos || []).length} />}
    </Shell>
  );
}

function PhotosRecap({ x, t }) {
  const b = (x.photos || []).filter((p) => p.phase === 'before'), a = (x.photos || []).filter((p) => p.phase === 'after');
  if (!b.length && !a.length) return null;
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm space-y-3">
      {b.length > 0 && <div><p className="text-xs font-bold text-slate-500 mb-1">{t('before')}</p><div className="flex gap-2 overflow-x-auto">{b.map((p) => <AuthImg key={p.id} src={`/photos/${p.id}`} className="h-24 w-24 rounded-2xl object-cover shrink-0" />)}</div></div>}
      {a.length > 0 && <div><p className="text-xs font-bold text-slate-500 mb-1">{t('after')}</p><div className="flex gap-2 overflow-x-auto">{a.map((p) => <AuthImg key={p.id} src={`/photos/${p.id}`} className="h-24 w-24 rounded-2xl object-cover shrink-0" />)}</div></div>}
    </div>
  );
}

function OutcomeSheet({ onClose, onPick, existingPhotos }) {
  const { t, me, lang } = useStaff();
  const [sel, setSel] = useState(null); const [note, setNote] = useState(''); const [files, setFiles] = useState([]);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  const needPhoto = sel?.requiresPhoto && !files.length && !existingPhotos;
  return (
    <div className="fixed inset-0 z-30 bg-black/50 flex items-end" onClick={onClose}>
      <div className="w-full max-w-lg mx-auto rounded-t-3xl bg-white p-4 pb-8 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
        <p className="text-xl font-bold text-slate-800 mb-3">{t('pick')}</p>
        <div className="grid grid-cols-2 gap-2">
          {(me?.outcomes || []).map((o) => { const Icon = OUTCOME_ICON[o.icon] || HelpCircle; const on = sel?.key === o.key; return (
            <button key={o.key} onClick={() => setSel(o)} className={`rounded-2xl border-2 p-4 flex flex-col items-center gap-2 text-center ${on ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-slate-200 text-slate-700'}`}><Icon size={32} /><span className="font-bold text-sm leading-tight">{lang === 'ar' ? o.labelAr : o.labelEn}</span></button>); })}
        </div>
        {sel && (
          <div className="mt-4 space-y-3">
            {sel.requiresPhoto && <p className="text-sm text-orange-700 font-semibold">{t('photoRequired')}</p>}
            <PhotoStrip label={t('addPhoto')} localUrls={urls} onAdd={(f) => setFiles((a) => [...a, ...f])} />
            <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base" placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
            <button disabled={needPhoto} onClick={() => onPick(sel, note, files)} className="w-full rounded-3xl bg-orange-600 text-white py-4 text-xl font-bold disabled:opacity-40">{t('confirmOutcome')}</button>
          </div>
        )}
        <button onClick={onClose} className="mt-3 w-full rounded-3xl bg-slate-100 text-slate-700 py-3 text-base font-semibold">{t('back')}</button>
      </div>
    </div>
  );
}

export default function StaffApp() {
  return (
    <StaffProvider>
      <QueueProvider>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route index element={<RequireStaff><HomePage /></RequireStaff>} />
          <Route path="task/:id" element={<RequireStaff><TaskPage /></RequireStaff>} />
          <Route path="*" element={<Navigate to="/s" replace />} />
        </Routes>
      </QueueProvider>
    </StaffProvider>
  );
}
