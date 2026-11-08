import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useQuery } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { PageHeader, Loading, ErrorBox, Tabs, DescriptionList, DataTable, StatusBadge, Empty } from '../components/ui.jsx';
import { OwnerForm } from './Owners.jsx';
import SubscriptionTable, { PaymentTable } from '../components/SubscriptionTable.jsx';

export default function OwnerDetail() {
  const { id } = useParams(); const { t, lang } = useI18n(); const { can } = useAuth(); const navigate = useNavigate();
  const { data: o, loading, error, reload } = useQuery(`/admin/owners/${id}`);
  const [tab, setTab] = useState('units'); const [edit, setEdit] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !o) return <Loading />;
  return (
    <div className="fade-in">
      <Link to="/owners" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={14} className="rtl:rotate-180" />{t('nav.owners')}</Link>
      <PageHeader title={o.name} subtitle={<span dir="ltr">{o.mobile}</span>} actions={can('owners.manage') && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={16} />{t('common.edit')}</button>} />
      <div className="card p-5 mb-6"><DescriptionList cols={3} items={[[t('common.mobile'), <span dir="ltr">{o.mobile}</span>], [t('units.altMobile'), <span dir="ltr">{o.altMobile}</span>], [t('common.email'), o.email], [t('common.notes'), o.notes]]} /></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'units', label: t('owners.units'), count: o.units.length }, { value: 'vehicles', label: t('owners.vehicles'), count: o.vehicles.length }, { value: 'subs', label: t('units.history'), count: o.subscriptions.length }, { value: 'payments', label: t('units.payments'), count: o.payments.length }, { value: 'washing', label: t('units.washing') }]} />
      {tab === 'units' && <DataTable columns={[{ key: 'unitNumber', header: t('units.unitNumber'), render: (r) => <span className="font-medium">{r.unitNumber}</span> }, { key: 'compoundName', header: t('common.compound') }, { key: 'notes', header: t('common.notes') }]} rows={o.units} onRowClick={(r) => navigate(`/units/${r.id}`)} />}
      {tab === 'vehicles' && <DataTable columns={[{ key: 'plateNumber', header: t('vehicles.plate'), render: (r) => <div><p className="font-medium" dir="ltr">{r.plateNumber}</p><p className="text-xs text-slate-500">{r.brand} {r.model}</p></div> }, { key: 'unitNumber', header: t('units.unitNumber'), render: (r) => `${r.unitNumber} · ${r.compoundName}` }, { key: 'vehicleType', header: t('vehicles.type'), render: (r) => t(`vehicles.types.${r.vehicleType}`) }, { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`common.${r.status}`)} /> }]} rows={o.vehicles} onRowClick={(r) => navigate(`/vehicles/${r.id}`)} />}
      {tab === 'subs' && <SubscriptionTable rows={o.subscriptions} />}
      {tab === 'payments' && <PaymentTable rows={o.payments} />}
      {tab === 'washing' && <div className="card"><Empty title={t('common.phase3')} /></div>}
      {edit && <OwnerForm open onClose={() => setEdit(false)} initial={o} onSaved={reload} />}
    </div>
  );
}
