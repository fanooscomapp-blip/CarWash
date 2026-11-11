import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Phone, MessageCircle } from 'lucide-react';
import { portalAr, portalEn } from '../i18n/portal.js';

export const papi = axios.create({ baseURL: '/api/portal' });
papi.interceptors.request.use((cfg) => { const t = localStorage.getItem('cw_owner_token'); if (t) cfg.headers.Authorization = `Bearer ${t}`; return cfg; });
papi.interceptors.response.use((r) => r, (err) => {
  const p = err.response?.data?.error; const e = new Error(p?.message || err.message); e.code = p?.code; e.status = err.response?.status;
  if (e.status === 401 && !err.config?.url?.includes('/otp/')) { localStorage.removeItem('cw_owner_token'); window.dispatchEvent(new Event('cw:owner-logout')); }
  return Promise.reject(e);
});

const Ctx = createContext(null);
export function PortalProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('cw_portal_lang') || 'ar');
  const [company, setCompany] = useState(null);
  const [owner, setOwner] = useState(() => { try { return JSON.parse(localStorage.getItem('cw_owner') || 'null'); } catch { return null; } });
  useEffect(() => { localStorage.setItem('cw_portal_lang', lang); document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  useEffect(() => { papi.get('/config').then((r) => { setCompany(r.data); if (!localStorage.getItem('cw_portal_lang') && r.data.language) setLang(r.data.language); }).catch(() => {}); }, []);
  useEffect(() => { const h = () => { setOwner(null); localStorage.removeItem('cw_owner'); }; window.addEventListener('cw:owner-logout', h); return () => window.removeEventListener('cw:owner-logout', h); }, []);
  const t = useCallback((k, vars) => { let s = (lang === 'ar' ? portalAr : portalEn)[k] ?? portalEn[k] ?? k; if (typeof s === 'string' && vars) s = s.replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? ''); return s; }, [lang]);
  const login = (token, o) => { localStorage.setItem('cw_owner_token', token); localStorage.setItem('cw_owner', JSON.stringify(o)); setOwner(o); };
  const logout = async () => { try { await papi.post('/logout'); } catch { /* ignore */ } localStorage.removeItem('cw_owner_token'); localStorage.removeItem('cw_owner'); setOwner(null); };
  const value = useMemo(() => ({ lang, setLang, t, company, owner, login, logout, isRtl: lang === 'ar', loggedIn: !!localStorage.getItem('cw_owner_token') && !!owner }), [lang, t, company, owner]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const usePortal = () => useContext(Ctx);

export const fmtDate = (v, lang) => { if (!v) return '—'; const d = new Date(String(v).length === 10 ? v + 'T00:00:00' : v); return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d); };
export const fmtTime = (v, lang) => (v ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : '—');
export const fmtMoney = (v, cur = 'EGP', lang = 'ar') => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(Number(v || 0));

export const STATUS_TONE = { active: 'bg-emerald-50 text-emerald-700 border-emerald-200', expiring_soon: 'bg-orange-50 text-orange-700 border-orange-200', expired: 'bg-red-50 text-red-700 border-red-200', pending_payment: 'bg-amber-50 text-amber-700 border-amber-200', suspended: 'bg-slate-100 text-slate-600 border-slate-200', cancelled: 'bg-slate-100 text-slate-600 border-slate-200', pending_verification: 'bg-amber-50 text-amber-700 border-amber-200', approved: 'bg-emerald-50 text-emerald-700 border-emerald-200', rejected: 'bg-red-50 text-red-700 border-red-200', awaiting_new_receipt: 'bg-red-50 text-red-700 border-red-200' };
export function Badge({ status, label }) {
  const { t } = usePortal();
  const map = { active: 'active', expiring_soon: 'expiring', expired: 'expired', pending_payment: 'pending' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label || (map[status] ? t(map[status]) : t(`st_${status}`))}</span>;
}

// Authenticated image → blob URL
export function AuthImg({ src, className, onClick }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let alive = true; let obj; papi.get(src.replace(/^\/api\/portal/, ''), { responseType: 'blob' }).then((r) => { if (!alive) return; obj = URL.createObjectURL(r.data); setUrl(obj); }).catch(() => {}); return () => { alive = false; if (obj) URL.revokeObjectURL(obj); }; }, [src]);
  return url ? <img src={url} alt="" className={className} onClick={onClick} /> : <div className={`${className} bg-slate-100 animate-pulse`} />;
}

// "Contact the administration" buttons (phone + WhatsApp) – numbers come from Settings → Owner portal
const waNumber = (m) => { const d = String(m || '').replace(/\D/g, ''); return d.startsWith('0') ? '20' + d.slice(1) : d; };
export function ContactAdmin({ company: c, className = '' }) {
  const { t, company } = usePortal(); const co = c || company || {};
  if (!co.contactPhone && !co.contactWhatsapp) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs text-slate-500 basis-full">{t('contactAdmin')}</span>
      {co.contactPhone && <a href={`tel:${co.contactPhone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Phone size={14} />{t('callAdmin')}</a>}
      {co.contactWhatsapp && <a href={`https://wa.me/${waNumber(co.contactWhatsapp)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"><MessageCircle size={14} />WhatsApp</a>}
    </div>
  );
}
