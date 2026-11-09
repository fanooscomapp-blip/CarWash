import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Car, Plus, Trash2, Check, Upload, FileImage, AlertTriangle, Clock, Search } from 'lucide-react';
import { papi, usePortal, fmtMoney, fmtDate } from './portalLib.jsx';
import { PortalShell, Card, BigButton, Spinner, Center } from './PortalLayout.jsx';
import PaymentBox from './PaymentBox.jsx';

const newVehicle = () => ({ key: Math.random().toString(36).slice(2), plateNumber: '', brand: '', model: '', color: 'white', vehicleType: 'sedan' });
const colorName = (t, k) => ({ ar: { white: 'أبيض', black: 'أسود', silver: 'فضي', grey: 'رمادي', blue: 'أزرق', navy: 'كحلي', red: 'أحمر', maroon: 'عنابي', green: 'أخضر', beige: 'بيج', brown: 'بني', gold: 'ذهبي', orange: 'برتقالي', yellow: 'أصفر', purple: 'بنفسجي', other: 'أخرى' }, en: { white: 'White', black: 'Black', silver: 'Silver', grey: 'Grey', blue: 'Blue', navy: 'Navy', red: 'Red', maroon: 'Maroon', green: 'Green', beige: 'Beige', brown: 'Brown', gold: 'Gold', orange: 'Orange', yellow: 'Yellow', purple: 'Purple', other: 'Other' } })[t][k] || k;
const BODY_AR = { sedan: 'سيدان', suv: 'دفع رباعي', hatchback: 'هاتشباك', crossover: 'كروس أوفر', pickup: 'بيك أب', van: 'فان', coupe: 'كوبيه', minivan: 'ميني فان', motorcycle: 'دراجة نارية', other: 'أخرى' };
const BODY_EN = { sedan: 'Sedan', suv: 'SUV', hatchback: 'Hatchback', crossover: 'Crossover', pickup: 'Pickup', van: 'Van', coupe: 'Coupe', minivan: 'Minivan', motorcycle: 'Motorcycle', other: 'Other' };

function Brand({ value, onChange, brands, placeholder }) {
  const [open, setOpen] = useState(false); const box = useRef();
  useEffect(() => { const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const list = useMemo(() => brands.filter((b) => b.toLowerCase().includes((value || '').toLowerCase())).slice(0, 10), [brands, value]);
  return <div className="relative" ref={box}><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" /><input className="w-full rounded-xl border border-slate-300 ps-9 pe-3 py-3 text-base" value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { onChange(e.target.value); setOpen(true); }} />
    {open && list.length > 0 && <div className="absolute z-30 mt-1 w-full max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">{list.map((b) => <button type="button" key={b} onClick={() => { onChange(b); setOpen(false); }} className="block w-full text-start px-3 py-2 text-sm hover:bg-slate-50">{b}</button>)}</div>}</div>;
}

export default function JoinPage() {
  const { t, lang } = usePortal(); const navigate = useNavigate(); const [sp] = useSearchParams();
  const [cfg, setCfg] = useState(null); const [err, setErr] = useState(null);
  const [compoundId, setCompoundId] = useState(''); const [name, setName] = useState(''); const [mobile, setMobile] = useState(''); const [unit, setUnit] = useState('');
  const [vehicles, setVehicles] = useState([newVehicle()]); const [planId, setPlanId] = useState(''); const [file, setFile] = useState(null); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [submitErr, setSubmitErr] = useState(null); const fileRef = useRef();
  useEffect(() => { papi.get('/join/config').then((r) => { setCfg(r.data); const pre = sp.get('c'); const c = r.data.compounds.find((x) => x.code === pre || x.id === pre); setCompoundId(c?.id || (r.data.compounds.length === 1 ? r.data.compounds[0].id : '')); }).catch((e) => setErr(e)); }, []); // eslint-disable-line
  const cur = cfg?.company?.currency || 'EGP';
  const eligiblePlans = useMemo(() => (cfg?.plans || []).filter((p) => vehicles.length <= p.maxVehicles && (p.scope !== 'per_vehicle' || vehicles.length === 1)), [cfg, vehicles.length]);
  useEffect(() => { if (eligiblePlans.length && !eligiblePlans.some((p) => p.id === planId)) setPlanId(eligiblePlans[0].id); }, [eligiblePlans]); // eslint-disable-line
  const priceOf = (p) => { const vt = vehicles[0]?.vehicleType; const o = p.overrides.find((x) => x.compoundId === compoundId && x.vehicleType === vt) || p.overrides.find((x) => x.compoundId === compoundId && !x.vehicleType) || p.overrides.find((x) => !x.compoundId && x.vehicleType === vt); return o ? o.price : p.price; };
  const plan = eligiblePlans.find((p) => p.id === planId);
  const pName = (p) => (lang === 'ar' && p?.nameAr) ? p.nameAr : p?.name;
  const upd = (k, patch) => setVehicles((vs) => vs.map((v) => (v.key === k ? { ...v, ...patch } : v)));
  const valid = compoundId && name.trim().length >= 2 && mobile.replace(/\D/g, '').length >= 10 && unit.trim() && vehicles.every((v) => v.plateNumber.trim()) && planId && file;
  const submit = async () => {
    setBusy(true); setSubmitErr(null);
    try {
      const fd = new FormData(); fd.append('compoundId', compoundId); fd.append('ownerName', name.trim()); fd.append('mobile', mobile); fd.append('unitNumber', unit); fd.append('planId', planId); if (note) fd.append('note', note);
      fd.append('vehicles', JSON.stringify(vehicles.map(({ key, ...v }) => ({ ...v, brand: v.brand || null, model: v.model || null })))); fd.append('receipt', file);
      const r = await papi.post('/join', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      try { localStorage.setItem('cw_join_token', r.data.statusToken); } catch { /* ignore */ }
      navigate(`/p/join/status/${r.data.statusToken}`, { replace: true });
    } catch (e) { setSubmitErr(e.message); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } finally { setBusy(false); }
  };

  if (err) return <PortalShell><Center><AlertTriangle size={40} className="text-orange-500" /><p className="font-semibold text-slate-800 max-w-xs">{err.code === 'JOIN_DISABLED' ? t('joinClosed') : t('error')}</p></Center></PortalShell>;
  if (!cfg) return <PortalShell><Center><Spinner /></Center></PortalShell>;
  const colors = cfg.catalog.colors; const bodies = cfg.catalog.bodyTypes; const B = lang === 'ar' ? BODY_AR : BODY_EN;
  const Lbl = ({ children, req }) => <span className="block text-xs font-semibold text-slate-500 mb-1">{children}{req && <span className="text-red-500 ms-0.5">*</span>}</span>;
  const inp = 'w-full rounded-xl border border-slate-300 px-3 py-3 text-base';

  return (
    <PortalShell>
      <div className="space-y-4">
        <div><h1 className="text-2xl font-bold text-navy-900">{t('joinTitle')}</h1><p className="text-sm text-slate-500 mt-1">{t('joinSubtitle')}</p></div>
        <Card className="p-4 space-y-3">
          <label><Lbl req>{t('joinCompound')}</Lbl><select className={inp + ' bg-white'} value={compoundId} onChange={(e) => setCompoundId(e.target.value)}><option value="">—</option>{cfg.compounds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label><Lbl req>{t('joinName')}</Lbl><input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><Lbl req>{t('joinMobile')}</Lbl><input className={inp} dir="ltr" inputMode="tel" autoComplete="tel" placeholder="01xxxxxxxxx" value={mobile} onChange={(e) => setMobile(e.target.value)} /></label>
            <label><Lbl req>{t('joinUnit')}</Lbl><input className={inp + ' uppercase font-semibold'} value={unit} placeholder="A-101" onChange={(e) => setUnit(e.target.value)} /></label>
          </div>
        </Card>

        {vehicles.map((v, i) => (
          <Card key={v.key} className="p-4 space-y-3">
            <div className="flex items-center justify-between"><p className="font-semibold text-navy-900 flex items-center gap-2"><Car size={18} className="text-brand-600" />{t('joinVehicle', { n: i + 1 })}</p>{vehicles.length > 1 && <button type="button" className="p-1.5 text-red-600" onClick={() => setVehicles((vs) => vs.filter((x) => x.key !== v.key))}><Trash2 size={16} /></button>}</div>
            <label><Lbl req>{t('joinPlate')}</Lbl><input className={inp + ' uppercase font-bold tracking-wide'} dir="ltr" placeholder="ABC 1234" value={v.plateNumber} onChange={(e) => upd(v.key, { plateNumber: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>{t('joinBrand')}</Lbl><Brand value={v.brand} onChange={(x) => upd(v.key, { brand: x })} brands={cfg.catalog.brands} placeholder={t('joinBrandSearch')} /></div>
              <label><Lbl>{t('joinModel')}</Lbl><input className={inp} value={v.model} placeholder="Corolla" onChange={(e) => upd(v.key, { model: e.target.value })} /></label>
            </div>
            <div><Lbl>{t('joinBody')}</Lbl><div className="flex flex-wrap gap-1.5">{bodies.map((b) => <button type="button" key={b} onClick={() => upd(v.key, { vehicleType: b })} className={`rounded-lg px-3 py-2 text-sm border ${v.vehicleType === b ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-700 border-slate-300'}`}>{B[b]}</button>)}</div></div>
            <div><Lbl>{t('joinColor')} · {colorName(lang, v.color)}</Lbl><div className="flex flex-wrap gap-2">{colors.map((c) => <button type="button" key={c.key} onClick={() => upd(v.key, { color: c.key })} className={`h-9 w-9 rounded-full border ${v.color === c.key ? 'ring-2 ring-offset-2 ring-brand-600 border-transparent' : 'border-slate-300'}`} style={{ background: c.hex }}>{v.color === c.key && <Check size={16} className={`mx-auto ${['white', 'beige', 'yellow', 'silver'].includes(c.key) ? 'text-slate-800' : 'text-white'}`} />}</button>)}</div></div>
          </Card>
        ))}
        {vehicles.length < 5 && <button type="button" onClick={() => setVehicles((vs) => [...vs, newVehicle()])} className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 flex items-center justify-center gap-2"><Plus size={16} />{t('joinAddVehicle')}</button>}

        <div><p className="px-1 mb-2 font-semibold text-slate-800">{t('joinPlan')}</p>
          <div className="space-y-2">{eligiblePlans.map((p) => { const on = p.id === planId; return (
            <button key={p.id} type="button" onClick={() => setPlanId(p.id)} className={`w-full text-start rounded-2xl border-2 p-4 ${on ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between gap-3"><div><p className="font-bold text-navy-900">{pName(p)}</p><p className="text-xs text-slate-500 mt-0.5">{p.durationDays} {t('days')} · {t('washesN', { n: p.maxWashes })} · {t('perWeek', { n: p.maxFrequencyPerWeek })}</p></div><div className="text-end"><p className="text-lg font-bold text-navy-900">{fmtMoney(priceOf(p), cur, lang)}</p>{on && <span className="text-[11px] text-brand-600 font-semibold flex items-center gap-1 justify-end"><Check size={12} />{t('selected')}</span>}</div></div>
            </button>); })}</div></div>

        {plan && <Card className="p-4"><PaymentBox amount={priceOf(plan)} payment={cfg.payment} currency={cur} /></Card>}

        <Card className="p-4 space-y-3">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {!file ? <button type="button" onClick={() => fileRef.current.click()} className="w-full rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/40 py-8 flex flex-col items-center gap-2 text-brand-700"><Upload size={28} /><span className="font-semibold">{t('uploadReceipt')}</span><span className="text-xs text-slate-500">JPG · PNG · PDF</span></button>
            : <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">{file.type.startsWith('image/') ? <img src={URL.createObjectURL(file)} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <FileImage className="h-16 w-16 text-slate-400" />}<div className="flex-1 min-w-0 text-sm"><p className="truncate font-medium">{file.name}</p></div><button type="button" className="text-xs text-brand-600 font-semibold" onClick={() => fileRef.current.click()}>{t('changeFile')}</button></div>}
          <input className={inp} placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
          {submitErr && <p className="text-sm text-red-600 rounded-lg bg-red-50 px-3 py-2">{submitErr}</p>}
          {!valid && <p className="text-xs text-slate-500">{t('joinRequired')}</p>}
          <BigButton disabled={!valid || busy} onClick={submit} className="bg-brand-600 text-white hover:bg-brand-500 flex items-center justify-center gap-2">{busy ? <Spinner /> : <Check size={18} />}{busy ? t('submitting') : t('joinSubmit')}</BigButton>
        </Card>
        <p className="text-center text-xs"><Link to="/p/login" className="text-brand-600 underline">{t('loginInstead')}</Link></p>
      </div>
    </PortalShell>
  );
}

export function JoinStatusPage() {
  const { token } = useParams(); const { t, lang, company } = usePortal(); const navigate = useNavigate();
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { papi.get(`/join/status/${token}`).then((r) => setD(r.data)).catch((e) => setErr(e)); }, [token]);
  if (err) return <PortalShell><Center><AlertTriangle size={40} className="text-orange-500" /><p>{t('error')}</p></Center></PortalShell>;
  if (!d) return <PortalShell><Center><Spinner /></Center></PortalShell>;
  const tone = { approved: ['border-emerald-300', 'bg-emerald-100 text-emerald-700'], rejected: ['border-red-300', 'bg-red-100 text-red-700'], pending: ['border-amber-300', 'bg-amber-100 text-amber-700'] }[d.status] || ['border-slate-300', 'bg-slate-100 text-slate-700'];
  const Icon = d.status === 'approved' ? Check : d.status === 'rejected' ? AlertTriangle : Clock;
  return (
    <PortalShell>
      <div className="space-y-4 pt-2">
        <Card className={`p-5 border-2 ${tone[0]}`}>
          <div className="flex items-start gap-3"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${tone[1]}`}><Icon /></span>
            <div><p className="text-lg font-bold text-navy-900">{d.status === 'approved' ? t('joinApproved') : d.status === 'rejected' ? t('joinRejected') : t('joinDoneTitle')}</p>
              <p className="text-sm text-slate-600 mt-1">{d.status === 'pending' ? t('joinDoneBody', { code: d.requestCode, mobile: d.mobile }) : `${t('request')} ${d.requestCode}`}</p>
              {d.rejectionReason && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><b>{t('rejectedReason')}:</b> {d.rejectionReason}</p>}</div></div>
        </Card>
        <Card className="p-4 text-sm space-y-2">
          <div className="flex justify-between"><span className="text-slate-500">{t('joinName')}</span><span className="font-medium">{d.ownerName}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('joinCompound')}</span><span className="font-medium">{d.compound} · {t('unit')} {d.unitNumber}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('vehicles')}</span><span className="font-medium" dir="ltr">{d.vehicles.map((v) => v.plateNumber).join(', ')}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('joinPlan')}</span><span className="font-medium">{lang === 'ar' && d.planNameAr ? d.planNameAr : d.planName} · {fmtMoney(d.amount, company?.currency || 'EGP', lang)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('submittedOn')}</span><span className="font-medium">{fmtDate(d.createdAt, lang)}</span></div>
        </Card>
        {d.status === 'pending' && <p className="text-center text-xs text-slate-500">{t('joinSaveLink')}</p>}
        {d.status === 'approved' && <BigButton onClick={() => navigate('/p/login')} className="bg-brand-600 text-white">{t('joinGoPortal')}</BigButton>}
        {d.status === 'rejected' && <BigButton onClick={() => navigate('/p/join')} className="bg-navy-900 text-white">{t('joinAgain')}</BigButton>}
      </div>
    </PortalShell>
  );
}
