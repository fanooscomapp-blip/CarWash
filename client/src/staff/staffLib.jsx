import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { staffAr, staffEn } from '../i18n/staff.js';

export const sapi = axios.create({ baseURL: '/api/s', timeout: 60000 });
sapi.interceptors.request.use((cfg) => { const t = localStorage.getItem('cw_staff_token'); if (t) cfg.headers.Authorization = `Bearer ${t}`; return cfg; });
sapi.interceptors.response.use((r) => r, (err) => {
  const p = err.response?.data?.error; const e = new Error(p?.message || err.message); e.code = p?.code; e.status = err.response?.status; e.network = !err.response;
  if (e.status === 401 && !err.config?.url?.includes('/login')) { localStorage.removeItem('cw_staff_token'); window.dispatchEvent(new Event('cw:staff-logout')); }
  return Promise.reject(e);
});

const Ctx = createContext(null);
export function StaffProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('cw_staff_lang') || 'ar');
  const [me, setMe] = useState(null);
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('cw_staff_user') || 'null'); } catch { return null; } });
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { localStorage.setItem('cw_staff_lang', lang); document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  useEffect(() => { const h = () => { setUser(null); setMe(null); localStorage.removeItem('cw_staff_user'); }; window.addEventListener('cw:staff-logout', h); return () => window.removeEventListener('cw:staff-logout', h); }, []);
  const loadMe = useCallback(async () => { try { const { data } = await sapi.get('/me'); setMe(data); } catch { /* offline: keep cached */ } }, []);
  useEffect(() => { if (user) loadMe(); }, [user, loadMe]);
  const t = useCallback((k, vars) => { let s = (lang === 'ar' ? staffAr : staffEn)[k] ?? staffEn[k] ?? k; if (vars) s = s.replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? ''); return s; }, [lang]);
  const login = (token, u) => { localStorage.setItem('cw_staff_token', token); localStorage.setItem('cw_staff_user', JSON.stringify(u)); setUser(u); };
  const logout = () => { localStorage.removeItem('cw_staff_token'); localStorage.removeItem('cw_staff_user'); setUser(null); setMe(null); };
  const value = useMemo(() => ({ lang, setLang, t, me, user, login, logout, online, isRtl: lang === 'ar', loggedIn: !!localStorage.getItem('cw_staff_token') && !!user }), [lang, t, me, user, online]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStaff = () => useContext(Ctx);

/** Downscale a camera photo to ≤1280px JPEG so uploads are fast on mobile data. */
export async function compressImage(file, max = 1280, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900 * 1024) return file;
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

/** Upload queue with automatic retry: jobs are { id, run: () => Promise } executed in order; failures retry every 6s. */
export function useUploadQueue() {
  const [jobs, setJobs] = useState([]); const [busy, setBusy] = useState(false); const [lastError, setLastError] = useState(null);
  const ref = useRef([]); const timer = useRef();
  const pump = useCallback(async () => {
    if (busy || !ref.current.length) return;
    setBusy(true); const job = ref.current[0];
    try { await job.run(); ref.current = ref.current.filter((j) => j !== job); setJobs([...ref.current]); setLastError(null); job.onDone?.(); }
    catch (e) {
      if (e.network || e.status >= 500) { setLastError(e); clearTimeout(timer.current); timer.current = setTimeout(() => { setBusy(false); pump(); }, 6000); return; }
      ref.current = ref.current.filter((j) => j !== job); setJobs([...ref.current]); job.onFail?.(e);
    }
    setBusy(false);
  }, [busy]);
  useEffect(() => { pump(); }, [jobs, pump]);
  useEffect(() => { const h = (e) => { if (ref.current.length) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, []);
  const enqueue = useCallback((job) => { ref.current = [...ref.current, { id: Math.random().toString(36).slice(2), ...job }]; setJobs([...ref.current]); }, []);
  const retryNow = useCallback(() => { clearTimeout(timer.current); setBusy(false); setTimeout(pump, 0); }, [pump]);
  return { enqueue, pending: jobs.length, busy, lastError, retryNow };
}

export function AuthImg({ src, className, onClick }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let alive = true; let obj; sapi.get(src, { responseType: 'blob' }).then((r) => { if (!alive) return; obj = URL.createObjectURL(r.data); setUrl(obj); }).catch(() => {}); return () => { alive = false; if (obj) URL.revokeObjectURL(obj); }; }, [src]);
  return url ? <img src={url} alt="" className={className} onClick={onClick} /> : <div className={`${className} bg-slate-200 animate-pulse`} />;
}

export const fmtTime = (v, lang) => (v ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : '—');
export const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b || Date.now()) - new Date(a)) / 60000));
export function useTicker(active) { const [, set] = useState(0); useEffect(() => { if (!active) return; const i = setInterval(() => set((x) => x + 1), 1000); return () => clearInterval(i); }, [active]); }
export const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60), r = s % 60; return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; };
