import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Power, UserCog } from 'lucide-react';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtMoney, fmtNum, monthLabel } from '../lib/format.js';
import { PageHeader, Loading, ErrorBox, StatusBadge, KpiCard, Tabs, DescriptionList, Modal, Spinner, useToast, DataTable } from '../components/ui.jsx';
import { CompoundForm } from './Compounds.jsx';

function StaffAssign({ open, onClose, compound, onSaved }) {
  const { t } = useI18n(); const toast = useToast(); const lookups = useLookups();
  const [sel, setSel] = useState(compound.staff.map((s) => s.id)); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await api.put(`/admin/compounds/${compound.id}/staff`, { userIds: sel }); toast.success(t('common.success')); onSaved(); onClose(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title={t('compounds.assignStaff')} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />}{t('common.save')}</button></>}>
      {!lookups.data ? <Loading rows={3} /> : !lookups.data.staff.length ? <p className="text-sm text-slate-500">{t('compounds.noStaff')}</p> : (
        <ul className="space-y-2">{lookups.data.staff.map((s) => <li key={s.id}><label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />{s.name}</label></li>)}</ul>
      )}
    </Modal>
  );
}

export default function CompoundDetail() {
  const { id } = useParams(); const { t, lang } = useI18n(); const { can, company } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const { data, loading, error, reload } = useQuery(`/admin/compounds/${id}`);
  const [tab, setTab] = useState('overview'); const [edit, setEdit] = useState(false); const [assign, setAssign] = useState(false); const [page, setPage] = useState(1);
  const units = useQuery('/admin/units', { compoundId: id, page, pageSize: 15 }, { enabled: tab === 'units' });
  const vehicles = useQuery('/admin/vehicles', { compoundId: id, page, pageSize: 15 }, { enabled: tab === 'vehicles' });
  const cur = company?.currency || 'EGP';
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const c = data;
  const toggle = async () => { try { await api.post(`/admin/compounds/${id}/status`, { status: c.status === 'active' ? 'inactive' : 'active' }); toast.success(t('common.success')); reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="fade-in">
      <Link to="/compounds" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft size={14} className="rtl:rotate-180" />{t('nav.compounds')}</Link>
      <PageHeader title={<span className="flex items-center gap-3">{c.name}<StatusBadge status={c.status} label={t(`common.${c.status}`)} /></span>} subtitle={`${c.code} · ${c.address || ''}`}
        actions={can('compounds.manage') && <><button className="btn-secondary" onClick={() => setAssign(true)}><UserCog size={16} />{t('compounds.assignStaff')}</button><button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={16} />{t('common.edit')}</button><button className={c.status === 'active' ? 'btn-danger' : 'btn-success'} onClick={toggle}><Power size={16} />{c.status === 'active' ? t('common.deactivate') : t('common.activate')}</button></>} />
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        <KpiCard label={t('compounds.unitsTab')} value={`${fmtNum(c.stats.units, lang)} / ${fmtNum(c.unitsCount, lang)}`} />
        <KpiCard label={t('compounds.vehiclesTab')} value={fmtNum(c.stats.vehicles, lang)} />
        <KpiCard label={t('compounds.activeSubs')} value={fmtNum(c.stats.active_subscriptions, lang)} tone="success" />
        <KpiCard label={t('dashboard.expiring')} value={fmtNum(c.stats.expiring_subscriptions, lang)} tone="warning" />
        <KpiCard label={t('dashboard.expired')} value={fmtNum(c.stats.expired_subscriptions, lang)} tone="danger" />
        <KpiCard label={t('compounds.revenue')} value={fmtMoney(c.stats.revenue, cur, lang)} tone="success" />
        <KpiCard label={t('compounds.outstanding')} value={fmtMoney(c.stats.outstanding, cur, lang)} tone="warning" />
      </div>
      <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[{ value: 'overview', label: t('compounds.overview') }, { value: 'units', label: t('compounds.unitsTab'), count: c.stats.units }, { value: 'vehicles', label: t('compounds.vehiclesTab'), count: c.stats.vehicles }]} />
      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="card p-5 lg:col-span-2 space-y-5">
            <DescriptionList cols={3} items={[[t('compounds.code'), c.code], [t('compounds.contactPerson'), c.contactPerson], [t('compounds.contactMobile'), <span dir="ltr">{c.contactMobile}</span>], [t('compounds.address'), c.address], [t('common.notes'), c.notes]]} />
            <div><p className="text-sm font-semibold mb-2">{t('compounds.revenueTrend')}</p>
              {c.revenueByMonth.length ? <div className="flex items-end gap-1 h-28">{c.revenueByMonth.map((m) => { const max = Math.max(...c.revenueByMonth.map((x) => Number(x.revenue))); return <div key={m.month} className="flex-1 flex flex-col items-center gap-1" title={`${m.month}: ${fmtMoney(m.revenue, cur, lang)}`}><div className="w-full rounded-t bg-brand-600" style={{ height: `${(Number(m.revenue) / max) * 90 + 4}%` }} /><span className="text-[10px] text-slate-400">{monthLabel(m.month, lang)}</span></div>; })}</div> : <p className="text-sm text-slate-500">—</p>}</div>
          </div>
          <div className="card p-5"><p className="text-sm font-semibold mb-3">{t('compounds.staff')}</p>
            {!c.staff.length ? <p className="text-sm text-slate-500">{t('compounds.noStaff')}</p> : <ul className="space-y-2">{c.staff.map((s) => <li key={s.id} className="flex items-center justify-between text-sm"><span>{s.name}</span><StatusBadge status={s.isActive ? 'active' : 'inactive'} label={s.isActive ? t('common.active') : t('common.inactive')} /></li>)}</ul>}</div>
        </div>
      )}
      {tab === 'units' && <DataTable columns={[
        { key: 'unitNumber', header: t('units.unitNumber'), render: (r) => <span className="font-medium">{r.unitNumber}</span> },
        { key: 'ownerName', header: t('units.ownerName'), render: (r) => <div>{r.ownerName}<p className="text-xs text-slate-500" dir="ltr">{r.ownerMobile}</p></div> },
        { key: 'vehiclesCount', header: t('units.vehicles') }, { key: 'activeSubscriptions', header: t('compounds.activeSubs') },
      ]} rows={units.data?.data} loading={units.loading} error={units.error} pagination={units.data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/units/${r.id}`)} />}
      {tab === 'vehicles' && <DataTable columns={[
        { key: 'plateNumber', header: t('vehicles.plate'), render: (r) => <div><p className="font-medium" dir="ltr">{r.plateNumber}</p><p className="text-xs text-slate-500">{r.brand} {r.model}</p></div> },
        { key: 'unitNumber', header: t('units.unitNumber') }, { key: 'ownerName', header: t('common.owner') },
        { key: 'currentSubscriptionStatus', header: t('vehicles.currentSub'), render: (r) => <StatusBadge status={r.currentSubscriptionStatus} /> },
      ]} rows={vehicles.data?.data} loading={vehicles.loading} error={vehicles.error} pagination={vehicles.data?.pagination} onPage={setPage} onRowClick={(r) => navigate(`/vehicles/${r.id}`)} />}
      {edit && <CompoundForm open onClose={() => setEdit(false)} initial={c} onSaved={reload} />}
      {assign && <StaffAssign open onClose={() => setAssign(false)} compound={c} onSaved={reload} />}
    </div>
  );
}
