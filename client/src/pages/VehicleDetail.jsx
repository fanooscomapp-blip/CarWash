import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RefreshCw, Plus, Camera, QrCode, Droplets } from 'lucide-react';
import { Modal, Field, Input, Textarea, Spinner } from '../components/ui.jsx';
import { useQuery } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { PageHeader, Loading, ErrorBox, Tabs, DescriptionList, StatusBadge, Empty, useToast } from '../components/ui.jsx';
import { VehicleForm } from './Vehicles.jsx';
import SubscriptionTable from '../components/SubscriptionTable.jsx';
import RenewModal from '../components/RenewModal.jsx';
import { colorName } from '../components/VehiclePickers.jsx';

export default function VehicleDetail() {
  const { id } = useParams(); const { t, lang } = useI18n(); const { can } = useAuth(); const navigate = useNavigate(); const toast = useToast();
  const { data: v, loading, error, reload } = useQuery(`/admin/vehicles/${id}`);
  const [tab, setTab] = useState('subs'); const [edit, setEdit] = useState(false); const [renew, setRenew] = useState(null); const fileRef = useRef();
  const [photoKey, setPhotoKey] = useState(0); const [washModal, setWashModal] = useState(false);
  const washes = useQuery(`/admin/wash-records/vehicle/${id}`, {}, { enabled: tab === 'washing' });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !v) return <Loading />;
  const current = v.subscriptions.find((s) => s.id === v.currentSubscriptionId);
  const canRenew = current && !['cancelled', 'pending_payment'].includes(current.status);
  const upload = async (file) => {
    if (!file) return; const fd = new FormData(); fd.append('photo', file);
    try { await api.post(`/admin/vehicles/${id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); toast.success(t('common.success')); setPhotoKey((k) => k + 1); reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="fade-in">
      <Link to="/vehicles" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={14} className="rtl:rotate-180" />{t('nav.vehicles')}</Link>
      <PageHeader title={<span className="flex items-center gap-3"><span dir="ltr">{v.plateNumber}</span><StatusBadge status={v.status} label={t(`common.${v.status}`)} /></span>} subtitle={`${v.vehicleCode} · ${v.brand || ''} ${v.model || ''} · ${colorName(t, v.color)}`}
        actions={<>
          {can('subscriptions.renew', 'subscriptions.manage') && canRenew && <button className="btn-accent" onClick={() => setRenew({ ...current, plates: v.plateNumber, ownerName: v.ownerName, unitNumber: v.unitNumber, compoundName: v.compoundName, compoundId: v.compoundId, vehicleIds: [v.id] })}><RefreshCw size={16} />{t('vehicles.renew')}</button>}
          {can('subscriptions.manage') && !current?.status?.match(/active|expiring_soon|pending_payment|suspended/) && <button className="btn-primary" onClick={() => navigate(`/subscriptions/new?unitId=${v.unitId}&vehicleId=${v.id}`)}><Plus size={16} />{t('vehicles.newSubscription')}</button>}
          {can('vehicles.manage') && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={16} />{t('common.edit')}</button>}
          {can('operations.manage') && current && ['active', 'expiring_soon'].includes(current.status) && <button className="btn-secondary" onClick={() => setWashModal(true)}><Droplets size={16} />{t('wash.record')}</button>}
        </>} />
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <DescriptionList cols={3} items={[
            [t('common.unit'), <Link className="text-brand-600 hover:underline" to={`/units/${v.unitId}`}>{v.unitNumber}</Link>], [t('common.compound'), <Link className="text-brand-600 hover:underline" to={`/compounds/${v.compoundId}`}>{v.compoundName}</Link>], [t('common.owner'), <Link className="text-brand-600 hover:underline" to={`/owners/${v.ownerId}`}>{v.ownerName}</Link>],
            [t('vehicles.type'), t(`vehicles.types.${v.vehicleType}`)], [t('vehicles.registrationDate'), fmtDate(v.registrationDate, lang)], [t('common.mobile'), <span dir="ltr">{v.ownerMobile}</span>],
            [t('vehicles.currentSub'), current ? <span className="flex items-center gap-2 flex-wrap"><StatusBadge status={current.status} /><span className="text-xs text-slate-500">{current.planName} · {fmtDate(current.startDate, lang)} → {fmtDate(current.endDate, lang)} · {current.washesAllowed - current.washesUsed} {t('vehicles.washesLeft')}</span></span> : <StatusBadge status={null} />],
            [t('vehicles.parking'), v.parkingLocation], [t('vehicles.gps'), v.gpsLat ? <a className="text-brand-600 hover:underline" dir="ltr" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${v.gpsLat},${v.gpsLng}`}>{v.gpsLat}, {v.gpsLng} ↗</a> : null],
            [t('common.notes'), v.notes],
          ]} />
        </div>
        <div className="card p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold mb-2 flex items-center gap-2"><Camera size={15} />{t('vehicles.photo')}</p>
            <div className="aspect-video rounded-lg bg-slate-100 overflow-hidden grid place-items-center text-slate-400 text-xs">{v.photoPath ? <AuthImage key={photoKey} src={`/admin/vehicles/${id}/photo`} /> : t('common.none')}</div>
            {can('vehicles.manage') && <><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /><button className="btn-secondary btn-sm mt-2" onClick={() => fileRef.current.click()}>{t('vehicles.uploadPhoto')}</button></>}
          </div>
          <div className="text-xs text-slate-500"><p className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2"><QrCode size={15} />{t('vehicles.qr')}</p><p className="font-mono break-all bg-slate-50 rounded p-2 text-[11px]" dir="ltr">{v.qrToken}</p><p className="mt-1">{t('vehicles.qrHint')}</p></div>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'subs', label: t('vehicles.history'), count: v.subscriptions.length }, { value: 'washing', label: t('units.washing') }]} />
      {tab === 'subs' && <SubscriptionTable rows={v.subscriptions} showVehicles={false} />}
      {tab === 'washing' && (!washes.data ? <Loading /> : !washes.data.length ? <div className="card"><Empty title={t('wash.none')} /></div> : (
        <div className="space-y-3">{washes.data.map((w) => <div key={w.task_id} className="card p-4"><div className="flex items-center justify-between text-sm"><div><p className="font-semibold">{fmtDate(w.scheduled_date, lang)}</p><p className="text-xs text-slate-500">{w.staff_name || '—'}{w.notes ? ` · ${w.notes}` : ''}</p></div><StatusBadge status={w.operation_status || w.task_status} /></div>
          {w.photos && <div className="mt-3 grid grid-cols-2 gap-3">{['before', 'after'].map((ph) => <div key={ph}><p className="text-xs font-semibold text-slate-500 mb-1">{t(`wash.${ph}`)}</p><div className="flex flex-wrap gap-1.5">{w.photos.filter((p) => p.phase === ph).map((p) => <AuthImage key={p.id} src={`/admin/wash-records/photos/${p.id}`} className="h-20 w-20 rounded-lg object-cover" />)}</div></div>)}</div>}</div>)}</div>))}
      {washModal && <WashRecordModal vehicleId={id} onClose={() => setWashModal(false)} onSaved={() => { reload(); washes.reload(); setTab('washing'); }} />}
      {edit && <VehicleForm open onClose={() => setEdit(false)} initial={v} onSaved={reload} />}
      {renew && <RenewModal open onClose={() => setRenew(null)} subscription={renew} onRenewed={reload} />}
    </div>
  );
}

// Loads a protected image through the authenticated API and shows it as a blob
function AuthImage({ src, className = 'h-full w-full object-cover' }) {
  const [url, setUrl] = useState(null);
  useState(() => { api.get(src, { responseType: 'blob' }).then((r) => setUrl(URL.createObjectURL(r.data))).catch(() => {}); });
  return url ? <img src={url} alt="" className={className} onClick={() => window.open(url, '_blank')} /> : <span className={`${className} bg-slate-100 inline-block`} />;
}

function WashRecordModal({ vehicleId, onClose, onSaved }) {
  const { t } = useI18n(); const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [notes, setNotes] = useState(''); const [before, setBefore] = useState([]); const [after, setAfter] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { const fd = new FormData(); fd.append('vehicleId', vehicleId); fd.append('date', date); if (notes) fd.append('notes', notes); before.forEach((f) => fd.append('before', f)); after.forEach((f) => fd.append('after', f)); await api.post('/admin/wash-records', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); toast.success(t('common.success')); onSaved(); onClose(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const Pick = ({ label, files, set }) => <Field label={`${label} (${files.length})`}><input type="file" accept="image/*" multiple capture="environment" className="input" onChange={(e) => set(Array.from(e.target.files || []))} /></Field>;
  return <Modal open onClose={onClose} title={t('wash.record')} footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy || !before.length || !after.length} onClick={submit}>{busy && <Spinner />}{t('common.save')}</button></>}>
    <div className="grid sm:grid-cols-2 gap-4"><Field label={t('common.date')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><div /><Pick label={t('wash.before')} files={before} set={setBefore} /><Pick label={t('wash.after')} files={after} set={setAfter} /><Field label={t('common.notes')} className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>{error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}</div>
    <p className="text-xs text-slate-500 mt-3">{t('wash.recordHint')}</p></Modal>;
}
