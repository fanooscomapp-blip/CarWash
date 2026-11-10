import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Ban, Pencil, FileImage, UserPlus, Link2, Copy } from 'lucide-react';
import { useQuery, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDateTime, fmtMoney } from '../lib/format.js';
import { PageHeader, DataTable, Tabs, Select, StatusBadge, Modal, Field, Input, Textarea, ConfirmDialog, useToast, DescriptionList, Spinner, DeleteButton } from '../components/ui.jsx';
import { BrandPicker, ColorPicker, colorName } from '../components/VehiclePickers.jsx';

function Receipt({ id }) {
  const [url, setUrl] = useState(null); const [mime, setMime] = useState('');
  useEffect(() => { let obj; api.get(`/admin/registration-requests/${id}/receipt`, { responseType: 'blob' }).then((r) => { obj = URL.createObjectURL(r.data); setMime(r.data.type); setUrl(obj); }).catch(() => {}); return () => obj && URL.revokeObjectURL(obj); }, [id]);
  if (!url) return <div className="h-48 rounded-lg bg-slate-100 animate-pulse" />;
  if (mime === 'application/pdf') return <a href={url} target="_blank" rel="noreferrer" className="btn-secondary"><FileImage size={16} />PDF</a>;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="max-h-72 min-h-24 min-w-24 rounded-lg border border-slate-200 bg-slate-50 object-contain" /></a>;
}

function ReviewModal({ id, onClose, onChanged }) {
  const { t, lang } = useI18n(); const { can, company } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const { data: r, reload } = useQuery(`/admin/registration-requests/${id}`); const catalog = useQuery('/admin/registration/catalog'); const plans = useQuery('/admin/plans', { active: 'true' });
  const [edit, setEdit] = useState(false); const [form, setForm] = useState(null); const [dialog, setDialog] = useState(null); const [busy, setBusy] = useState(false);
  const cur = company?.currency || 'EGP';
  useEffect(() => { if (r && !form) setForm({ ownerName: r.ownerName, mobile: r.mobile, unitNumber: r.unitNumber, vehicles: r.vehicles, planId: r.planId, amount: Number(r.amount) }); }, [r]); // eslint-disable-line
  const act = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok || t('common.success')); setDialog(null); reload(); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const saveEdit = () => act(async () => { await api.put(`/admin/registration-requests/${id}`, form); setEdit(false); });
  if (!r) return <Modal open onClose={onClose} title={t('common.loading')}><Spinner /></Modal>;
  const pending = r.status === 'pending';
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><UserPlus size={18} />{r.requestCode} <StatusBadge status={r.status === 'pending' ? 'pending_verification' : r.status} label={t(`regreq.status_${r.status}`)} /></span>} size="xl"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
        {r.status === 'approved' && <button className="btn-secondary" onClick={() => navigate(`/owners/${r.resultOwnerId}`)}>{t('register.viewOwner')} →</button>}
        {pending && can('payments.approve') && <>{!edit && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={15} />{t('common.edit')}</button>}{edit && <button className="btn-primary" disabled={busy} onClick={saveEdit}>{busy && <Spinner />}{t('common.save')}</button>}
          <button className="btn-danger" onClick={() => setDialog('reject')}><Ban size={15} />{t('payments.reject')}</button><button className="btn-success" disabled={edit} onClick={() => setDialog('approve')}><CheckCircle2 size={15} />{t('regreq.approve')}</button></>}
      </>}>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          {!edit ? (
            <>
              <DescriptionList cols={2} items={[[t('units.ownerName'), r.ownerName], [t('common.mobile'), <span dir="ltr">{r.mobile}</span>], [t('common.compound'), r.compoundName], [t('register.unitCode'), <b>{r.unitNumber}</b>], [t('common.plan'), r.planName], [t('common.amount'), <b>{fmtMoney(r.amount, cur, lang)}</b>], [t('common.createdAt'), fmtDateTime(r.createdAt, lang)], r.note && [t('common.notes'), r.note], r.rejectionReason && [t('subs.rejectReason'), <span className="text-red-600">{r.rejectionReason}</span>], r.reviewedByName && [t('payments.approvedBy'), `${r.reviewedByName} · ${fmtDateTime(r.reviewedAt, lang)}`]]} />
              {r.existingOwnerId && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{t('regreq.existingOwner')}</p>}
              <div><p className="label">{t('common.vehicles')}</p><ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{r.vehicles.map((v, i) => <li key={i} className="px-3 py-2 text-sm flex items-center justify-between"><span className="font-semibold" dir="ltr">{v.plateNumber}</span><span className="text-xs text-slate-500">{[v.brand, v.model, colorName(t, v.color), t(`vehicles.types.${v.vehicleType || 'sedan'}`), v.parkingLocation].filter(Boolean).join(' · ')}{v.gpsLat && <a className="ms-1 text-brand-600" dir="ltr" href={`https://maps.google.com/?q=${v.gpsLat},${v.gpsLng}`} target="_blank" rel="noreferrer">📍GPS</a>}</span></li>)}</ul></div>
            </>
          ) : form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3"><Field label={t('units.ownerName')}><Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></Field><Field label={t('common.mobile')}><Input dir="ltr" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
                <Field label={t('register.unitCode')}><Input className="uppercase" value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} /></Field>
                <Field label={t('common.plan')}><Select value={form.planId} onChange={(e) => { const p = plans.data?.find((x) => x.id === e.target.value); setForm({ ...form, planId: e.target.value, amount: p ? Number(p.price) : form.amount }); }}>{(plans.data || []).map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.price, cur, lang)}</option>)}</Select></Field>
                <Field label={t('common.amount')}><Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field></div>
              {form.vehicles.map((v, i) => <div key={i} className="rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-2">
                <Field label={t('vehicles.plate')}><Input dir="ltr" className="uppercase font-semibold" value={v.plateNumber} onChange={(e) => setForm({ ...form, vehicles: form.vehicles.map((x, j) => (j === i ? { ...x, plateNumber: e.target.value } : x)) })} /></Field>
                <Field label={t('vehicles.brand')}><BrandPicker value={v.brand || ''} onChange={(val) => setForm({ ...form, vehicles: form.vehicles.map((x, j) => (j === i ? { ...x, brand: val } : x)) })} brands={catalog.data?.brands || []} /></Field>
                <Field label={t('vehicles.model')}><Input value={v.model || ''} onChange={(e) => setForm({ ...form, vehicles: form.vehicles.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)) })} /></Field>
                <Field label={t('register.bodyType')}><Select value={v.vehicleType || 'sedan'} onChange={(e) => setForm({ ...form, vehicles: form.vehicles.map((x, j) => (j === i ? { ...x, vehicleType: e.target.value } : x)) })}>{(catalog.data?.bodyTypes || []).map((b) => <option key={b} value={b}>{t(`vehicles.types.${b}`)}</option>)}</Select></Field>
                <Field label={t('register.parking')} className="col-span-2"><Input value={v.parkingLocation || ''} onChange={(e) => setForm({ ...form, vehicles: form.vehicles.map((x, j) => (j === i ? { ...x, parkingLocation: e.target.value } : x)) })} /></Field>
                <Field label={t('vehicles.color')} className="col-span-2"><ColorPicker value={v.color} onChange={(val) => setForm({ ...form, vehicles: form.vehicles.map((x, j) => (j === i ? { ...x, color: val } : x)) })} colors={catalog.data?.colors || []} t={t} /></Field>
              </div>)}
            </div>
          )}
        </div>
        <div><p className="label">{t('payments.receipts')}</p><Receipt id={r.id} /></div>
      </div>
      <ConfirmDialog open={dialog === 'approve'} onClose={() => setDialog(null)} loading={busy} title={t('regreq.approve')} message={t('regreq.approveConfirm')} confirmLabel={t('regreq.approve')} onConfirm={() => act(() => api.post(`/admin/registration-requests/${id}/approve`, {}), t('regreq.approved_ok'))} />
      <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} loading={busy} danger title={t('payments.reject')} reasonLabel={t('subs.rejectReason')} confirmLabel={t('payments.reject')} onConfirm={(reason) => act(() => api.post(`/admin/registration-requests/${id}/reject`, { reason }))} />
    </Modal>
  );
}

export default function RegistrationRequests() {
  const { t, lang } = useI18n(); const { company } = useAuth(); const lookups = useLookups(); const toast = useToast();
  const [status, setStatus] = useState('pending'); const [compoundId, setCompoundId] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const { data, loading, error, reload } = useQuery('/admin/registration-requests', { status, compoundId, page, pageSize: 20 });
  const cur = company?.currency || 'EGP';
  const joinLink = `${window.location.origin}/p/join`;
  const columns = [
    { key: 'requestCode', header: t('regreq.code'), render: (r) => <div><p className="font-mono text-xs font-semibold">{r.requestCode}</p><p className="text-xs text-slate-500">{fmtDateTime(r.createdAt, lang)}</p></div> },
    { key: 'ownerName', header: t('common.owner'), render: (r) => <div><p className="font-medium">{r.ownerName}</p><p className="text-xs text-slate-500" dir="ltr">{r.mobile}</p></div> },
    { key: 'compoundName', header: t('common.compound'), render: (r) => <div><p>{r.compoundName}</p><p className="text-xs text-slate-500">{t('common.unit')} {r.unitNumber}</p></div> },
    { key: 'vehicles', header: t('common.vehicles'), render: (r) => <span dir="ltr" className="font-medium">{r.vehicles.map((v) => v.plateNumber).join(', ')}</span> },
    { key: 'planName', header: t('common.plan'), render: (r) => <div><p>{r.planName}</p><p className="text-xs font-semibold">{fmtMoney(r.amount, cur, lang)}</p></div> },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status === 'pending' ? 'pending_verification' : r.status} label={t(`regreq.status_${r.status}`)} /> },
    { key: 'actions', header: '', className: 'text-end', render: (r) => r.status !== 'approved' && can('units.manage', 'payments.approve') && <DeleteButton url={`/admin/registration-requests/${r.id}`} name={r.ownerName} onDone={reload} /> },
  ];
  return (
    <div className="fade-in">
      <PageHeader title={t('regreq.title')} subtitle={t('regreq.subtitle')} actions={<button className="btn-secondary" onClick={() => { navigator.clipboard?.writeText(joinLink); toast.success(t('common.copied')); }}><Link2 size={16} />{t('regreq.copyJoinLink')}</button>} />
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><Link2 size={15} className="text-brand-600" /><span className="text-slate-500">{t('regreq.joinLink')}:</span><a className="flex-1 truncate text-brand-700 underline" dir="ltr" href={joinLink} target="_blank" rel="noreferrer">{joinLink}</a><button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(joinLink); toast.success(t('common.copied')); }}><Copy size={14} /></button></div>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: 'pending', label: t('regreq.status_pending'), count: data?.counters?.pending }, { value: 'approved', label: t('regreq.status_approved'), count: data?.counters?.approved }, { value: 'rejected', label: t('regreq.status_rejected'), count: data?.counters?.rejected }]} />
      <div className="flex gap-2 mb-4"><Select value={compoundId} onChange={(e) => { setCompoundId(e.target.value); setPage(1); }} className="w-52"><option value="">{t('dashboard.allCompounds')}</option>{lookups.data?.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
      <DataTable columns={columns} rows={data?.data} loading={loading} error={error} onRetry={reload} pagination={data?.pagination} onPage={setPage} onRowClick={(r) => setOpen(r.id)} emptyTitle={t('regreq.empty')} />
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
