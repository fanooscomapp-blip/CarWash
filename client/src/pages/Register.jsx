import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Plus, Trash2, MapPin, Check, UserRound, Phone, Building2, ExternalLink } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useQuery, useLookups, useDebounced } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { PageHeader, Field, Input, Spinner, useToast, StatusBadge } from '../components/ui.jsx';
import { BrandPicker, UnitInput, ColorPicker, GpsField, BodyTypePicker } from '../components/VehiclePickers.jsx';

const newRow = (unitNumber = '') => ({ key: Math.random().toString(36).slice(2), unitNumber, plateNumber: '', brand: '', model: '', color: 'white', vehicleType: 'sedan', parkingLocation: '', gpsLat: null, gpsLng: null, gpsBusy: false });

export default function Register() {
  const { t, lang } = useI18n(); const { can } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const lookups = useLookups(); const catalog = useQuery('/admin/registration/catalog');
  const [compoundId, setCompoundId] = useState(() => localStorage.getItem('cw_reg_compound') || '');
  const [mobile, setMobile] = useState(''); const [altMobile, setAltMobile] = useState(''); const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [lookup, setLookup] = useState(null); const [looking, setLooking] = useState(false);
  const [rows, setRows] = useState([newRow()]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [done, setDone] = useState(null);
  const debouncedMobile = useDebounced(mobile, 400);
  useEffect(() => { if (compoundId) localStorage.setItem('cw_reg_compound', compoundId); }, [compoundId]);
  useEffect(() => { if (lookups.data && !compoundId) { const first = lookups.data.compounds.find((c) => c.status === 'active'); if (first) setCompoundId(first.id); } }, [lookups.data]); // eslint-disable-line

  // Mobile lookup
  useEffect(() => {
    const digits = debouncedMobile.replace(/\D/g, '');
    if (digits.length < 10) { setLookup(null); return; }
    let alive = true; setLooking(true);
    api.get('/admin/registration/lookup', { params: { mobile: debouncedMobile } }).then((r) => { if (!alive) return; setLookup(r.data); if (r.data.found) { setName(r.data.owner.name); setEmail(r.data.owner.email || ''); setAltMobile(r.data.owner.altMobile || ''); const lastUnit = r.data.units.find((u) => u.compoundId === compoundId); if (lastUnit) setRows((rs) => rs.map((x, i) => (i === 0 && !x.unitNumber ? { ...x, unitNumber: lastUnit.unitNumber } : x))); } })
      .catch(() => alive && setLookup(null)).finally(() => alive && setLooking(false));
    return () => { alive = false; };
  }, [debouncedMobile]); // eslint-disable-line

  const upd = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, newRow(rs[rs.length - 1]?.unitNumber || '')]);
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const captureGps = (key) => {
    if (!navigator.geolocation) return toast.error(t('register.gpsUnsupported'));
    upd(key, { gpsBusy: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => upd(key, { gpsLat: +pos.coords.latitude.toFixed(6), gpsLng: +pos.coords.longitude.toFixed(6), gpsBusy: false }),
      () => { upd(key, { gpsBusy: false }); toast.error(t('register.gpsDenied')); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  const valid = compoundId && mobile.replace(/\D/g, '').length >= 10 && (lookup?.found || name.trim()) && rows.every((r) => r.unitNumber.trim() && r.plateNumber.trim());
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await api.post('/admin/registration', { compoundId, owner: { mobile, name: name.trim() || undefined, altMobile: altMobile || null, email: email || null }, vehicles: rows.map(({ key, gpsBusy, ...r }) => ({ ...r, brand: r.brand || null, model: r.model || null, parkingLocation: r.parkingLocation || null })) });
      setDone(data); toast.success(t('register.saved', { n: data.vehicles.length }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const reset = () => { setMobile(''); setAltMobile(''); setName(''); setEmail(''); setLookup(null); setRows([newRow()]); setDone(null); setError(null); };

  if (!can('units.manage', 'vehicles.manage')) return null;
  const compound = lookups.data?.activeCompounds.find((c) => c.id === compoundId);
  const existingHere = lookup?.found ? lookup.vehicles.filter((v) => v.compoundId === compoundId) : [];

  if (done) return (
    <div className="fade-in max-w-3xl">
      <PageHeader title={t('register.doneTitle')} />
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check /></span><div><p className="font-semibold text-navy-900">{done.owner.name} <span className="text-slate-500 font-normal" dir="ltr">{done.owner.mobile}</span></p><p className="text-sm text-slate-500">{done.createdOwner ? t('register.newOwnerCreated') : t('register.existingOwnerUsed')}{done.units.length ? ` · ${t('register.unitsCreated', { n: done.units.length })}` : ''}</p></div></div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{done.vehicles.map((v) => <li key={v.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><div><p className="font-semibold" dir="ltr">{v.plateNumber} <span className="font-mono text-xs text-slate-400">{v.vehicleCode}</span></p><p className="text-xs text-slate-500">{t('common.unit')} {v.unitNumber} · {v.brand || ''} {v.model || ''} · {t(`vehicles.types.${v.vehicleType}`)}</p></div><button className="btn-secondary btn-sm" onClick={() => navigate(`/subscriptions/new?unitId=${v.unitId}&vehicleId=${v.id}`)}>{t('vehicles.newSubscription')}</button></li>)}</ul>
        <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={reset}><Plus size={16} />{t('register.another')}</button><button className="btn-secondary" onClick={() => navigate(`/owners/${done.owner.id}`)}><ExternalLink size={16} />{t('register.viewOwner')}</button></div>
      </div>
    </div>
  );

  return (
    <div className="fade-in max-w-5xl pb-24">
      <PageHeader title={t('register.title')} subtitle={t('register.subtitle')} />
      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="space-y-4">
          {/* Compound + owner */}
          <div className="card p-5 grid sm:grid-cols-2 gap-4">
            <Field label={<span className="flex items-center gap-1.5"><Building2 size={13} />{t('common.compound')}</span>} required>
              <select className="input font-medium" value={compoundId} onChange={(e) => setCompoundId(e.target.value)}>{lookups.data?.activeCompounds.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <Field label={<span className="flex items-center gap-1.5"><Phone size={13} />{t('units.ownerMobile')}</span>} required hint={looking ? t('register.looking') : lookup?.found ? t('register.foundOwner') : lookup && !lookup.found ? t('register.newOwner') : t('register.mobileHint')}>
              <div className="relative"><Input dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" value={mobile} onChange={(e) => { setMobile(e.target.value); }} className={lookup?.found ? 'border-emerald-500 bg-emerald-50/40' : ''} />{looking && <Spinner className="absolute top-2.5 end-3 text-slate-400" />}{lookup?.found && !looking && <Check size={16} className="absolute top-3 end-3 text-emerald-600" />}</div>
            </Field>
            <Field label={<span className="flex items-center gap-1.5"><UserRound size={13} />{t('units.ownerName')}</span>} required={!lookup?.found}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.namePlaceholder')} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label={t('units.altMobile')}><Input dir="ltr" inputMode="tel" value={altMobile} onChange={(e) => setAltMobile(e.target.value)} /></Field><Field label={t('common.email')}><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
          </div>

          {/* Vehicles */}
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={r.key} className="card p-4 fade-in">
                <div className="flex items-center justify-between mb-3"><p className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Car size={16} className="text-brand-600" />{t('register.vehicleN', { n: i + 1 })}</p>{rows.length > 1 && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => removeRow(r.key)}><Trash2 size={14} /></button>}</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label={t('register.unitCode')} required><UnitInput value={r.unitNumber} onChange={(v) => upd(r.key, { unitNumber: v })} compoundId={compoundId} ownerId={lookup?.owner?.id} placeholder="A-101" /></Field>
                  <Field label={t('vehicles.plate')} required><Input dir="ltr" className="uppercase font-semibold" value={r.plateNumber} onChange={(e) => upd(r.key, { plateNumber: e.target.value })} placeholder="ABC 1234" /></Field>
                  <Field label={t('vehicles.brand')}><BrandPicker value={r.brand} onChange={(v) => upd(r.key, { brand: v })} brands={catalog.data?.brands || []} placeholder={t('register.brandPlaceholder')} /></Field>
                  <Field label={t('vehicles.model')}><Input value={r.model} onChange={(e) => upd(r.key, { model: e.target.value })} placeholder="Corolla" /></Field>
                  <Field label={t('register.bodyType')} className="sm:col-span-2 lg:col-span-4">
                    <BodyTypePicker value={r.vehicleType} onChange={(bt) => upd(r.key, { vehicleType: bt })} types={catalog.data?.bodyTypes || []} t={t} />
                  </Field>
                  <Field label={t('vehicles.color')} className="lg:col-span-2"><ColorPicker value={r.color} onChange={(v) => upd(r.key, { color: v })} colors={catalog.data?.colors || []} t={t} /></Field>
                  <Field label={<span className="flex items-center gap-1.5"><MapPin size={13} />{t('register.parking')}</span>} className="lg:col-span-3"><Input value={r.parkingLocation} onChange={(e) => upd(r.key, { parkingLocation: e.target.value })} placeholder={t('register.parkingPlaceholder')} /></Field>
                  <Field label={t('register.gps')}>
                    <GpsField lat={r.gpsLat} lng={r.gpsLng} busy={r.gpsBusy} onCapture={() => captureGps(r.key)} onClear={() => upd(r.key, { gpsLat: null, gpsLng: null })} />
                  </Field>
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary w-full border-dashed py-3" onClick={addRow}><Plus size={16} />{t('register.addVehicle')}</button>
          </div>

          {error && <p className="text-sm text-red-600 rounded-lg bg-red-50 border border-red-200 px-4 py-3">{error}</p>}
          <div className="flex items-center justify-between gap-3 card p-4 sticky bottom-3 shadow-lg z-10">
            <p className="text-sm text-slate-500">{compound?.name} · {rows.length} {t('common.vehicles').toLowerCase()}{lookup?.found ? ` · ${lookup.owner.name}` : name ? ` · ${name}` : ''}</p>
            <button className="btn-accent px-6" disabled={!valid || busy} onClick={submit}>{busy && <Spinner />}{t('register.save')}</button>
          </div>
        </div>

        {/* Side panel: existing owner summary */}
        <aside className="card p-4 space-y-3 lg:sticky lg:top-20">
          <p className="text-sm font-semibold text-navy-900">{t('register.sideTitle')}</p>
          {!lookup?.found ? <p className="text-sm text-slate-500">{t('register.sideEmpty')}</p> : (
            <>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm"><p className="font-semibold text-emerald-800">{lookup.owner.name}</p><p className="text-xs text-emerald-700" dir="ltr">{lookup.owner.mobile}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('owners.units')} ({lookup.units.length})</p><ul className="text-sm space-y-0.5">{lookup.units.map((u) => <li key={u.id} className="flex justify-between"><span className="font-medium">{u.unitNumber}</span><span className="text-xs text-slate-500">{u.compoundName}</span></li>)}</ul></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('owners.vehicles')} ({lookup.vehicles.length})</p>
                <ul className="text-sm space-y-1.5">{lookup.vehicles.map((v) => <li key={v.id} className="flex items-start justify-between gap-2"><div><p className="font-medium" dir="ltr">{v.plateNumber}</p><p className="text-xs text-slate-500">{v.brand} {v.model} · {v.unitNumber}{v.compoundId !== compoundId ? ` · ${v.compoundName}` : ''}</p></div><StatusBadge status={v.status} label={t(`common.${v.status}`)} /></li>)}</ul></div>
              {existingHere.length === 0 && lookup.vehicles.length > 0 && <p className="text-xs text-orange-600">{t('register.otherCompoundNote')}</p>}
              <button className="btn-ghost btn-sm w-full" onClick={() => navigate(`/owners/${lookup.owner.id}`)}>{t('register.viewOwner')} →</button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
