import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Car } from 'lucide-react';
import { useQuery } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { PageHeader, Loading, ErrorBox, Tabs, DescriptionList, StatusBadge, Empty } from '../components/ui.jsx';
import { UnitForm } from './Units.jsx';
import { VehicleForm } from './Vehicles.jsx';
import SubscriptionTable, { PaymentTable } from '../components/SubscriptionTable.jsx';

export default function UnitDetail() {
  const { id } = useParams(); const { t } = useI18n(); const { can } = useAuth(); const navigate = useNavigate();
  const { data: u, loading, error, reload } = useQuery(`/admin/units/${id}`);
  const [tab, setTab] = useState('vehicles'); const [edit, setEdit] = useState(false); const [addVehicle, setAddVehicle] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !u) return <Loading />;
  return (
    <div className="fade-in">
      <Link to="/units" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={14} className="rtl:rotate-180" />{t('nav.units')}</Link>
      <PageHeader title={`${t('common.unit')} ${u.unitNumber}`} subtitle={<Link to={`/compounds/${u.compoundId}`} className="hover:underline">{u.compoundName}</Link>}
        actions={<>{can('vehicles.manage') && <button className="btn-primary" onClick={() => setAddVehicle(true)}><Plus size={16} />{t('units.addVehicle')}</button>}{can('subscriptions.manage') && <button className="btn-accent" onClick={() => navigate(`/subscriptions/new?unitId=${u.id}`)}>{t('subs.add')}</button>}{can('units.manage') && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={16} />{t('common.edit')}</button>}</>} />
      <div className="card p-5 mb-6">
        <DescriptionList cols={3} items={[[t('units.ownerName'), <Link className="text-brand-600 hover:underline" to={`/owners/${u.ownerId}`}>{u.ownerName}</Link>], [t('units.ownerMobile'), <span dir="ltr">{u.ownerMobile}</span>], [t('units.altMobile'), <span dir="ltr">{u.ownerAltMobile}</span>], [t('common.email'), u.ownerEmail], [t('compounds.activeSubs'), u.activeSubscriptions], [t('common.notes'), u.notes]]} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'vehicles', label: t('units.vehicles'), count: u.vehicles.length }, { value: 'subs', label: t('units.history'), count: u.subscriptions.length }, { value: 'payments', label: t('units.payments'), count: u.payments.length }, { value: 'washing', label: t('units.washing') }]} />
      {tab === 'vehicles' && (!u.vehicles.length ? <div className="card"><Empty title={t('units.noVehicles')} /></div> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{u.vehicles.map((v) => (
          <button key={v.id} onClick={() => navigate(`/vehicles/${v.id}`)} className="card p-4 text-start hover:border-brand-500/50 transition-colors">
            <div className="flex items-start justify-between"><div><p className="font-semibold" dir="ltr">{v.plateNumber}</p><p className="text-sm text-slate-500">{v.brand} {v.model} · {v.color}</p></div><Car size={18} className="text-slate-300" /></div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span className="font-mono">{v.vehicleCode}</span><StatusBadge status={v.status} label={t(`common.${v.status}`)} /></div>
          </button>))}</div>))}
      {tab === 'subs' && <SubscriptionTable rows={u.subscriptions} />}
      {tab === 'payments' && <PaymentTable rows={u.payments} />}
      {tab === 'washing' && <div className="card"><Empty title={t('common.phase3')} /></div>}
      {edit && <UnitForm open onClose={() => setEdit(false)} initial={u} onSaved={reload} />}
      {addVehicle && <VehicleForm open onClose={() => setAddVehicle(false)} defaultUnit={{ id: u.id, unitNumber: u.unitNumber, compoundName: u.compoundName, ownerName: u.ownerName }} onSaved={reload} />}
    </div>
  );
}
