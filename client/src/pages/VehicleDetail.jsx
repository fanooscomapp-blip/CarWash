import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RefreshCw, Plus, Camera, QrCode } from 'lucide-react';
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
  const [photoKey, setPhotoKey] = useState(0);
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
            <div className="aspect-video rounded-lg bg-slate-100 overflow-hidden grid place-items-center text-slate-400 text-xs">{v.photoPath ? <AuthImage key={photoKey} src={`/api/admin/vehicles/${id}/photo`} /> : t('common.none')}</div>
            {can('vehicles.manage') && <><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /><button className="btn-secondary btn-sm mt-2" onClick={() => fileRef.current.click()}>{t('vehicles.uploadPhoto')}</button></>}
          </div>
          <div className="text-xs text-slate-500"><p className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2"><QrCode size={15} />{t('vehicles.qr')}</p><p className="font-mono break-all bg-slate-50 rounded p-2 text-[11px]" dir="ltr">{v.qrToken}</p><p className="mt-1">{t('vehicles.qrHint')}</p></div>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'subs', label: t('vehicles.history'), count: v.subscriptions.length }, { value: 'washing', label: t('units.washing') }]} />
      {tab === 'subs' && <SubscriptionTable rows={v.subscriptions} showVehicles={false} />}
      {tab === 'washing' && <div className="card"><Empty title={t('common.phase3')} /></div>}
      {edit && <VehicleForm open onClose={() => setEdit(false)} initial={v} onSaved={reload} />}
      {renew && <RenewModal open onClose={() => setRenew(null)} subscription={renew} onRenewed={reload} />}
    </div>
  );
}

// Loads a protected image through the authenticated API and shows it as a blob
function AuthImage({ src }) {
  const [url, setUrl] = useState(null);
  useState(() => { api.get(src, { responseType: 'blob' }).then((r) => setUrl(URL.createObjectURL(r.data))).catch(() => {}); });
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span>…</span>;
}
