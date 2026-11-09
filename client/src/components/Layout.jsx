import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, UserPlus, Inbox, Building2, Home, Users, Car, Layers, FileText, RefreshCw, CreditCard, Droplets, UserCog, MessageSquare, BarChart3, ShieldCheck, Settings, ScrollText, Bell, LogOut, Menu, X, Languages, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';

const NAV = [
  { group: 'management', items: [
    { to: '/', icon: LayoutDashboard, key: 'dashboard', perm: 'dashboard.view', end: true },
    { to: '/register', icon: UserPlus, key: 'register', perm: 'vehicles.manage', highlight: true },
    { to: '/compounds', icon: Building2, key: 'compounds', perm: 'compounds.view' },
    { to: '/units', icon: Home, key: 'units', perm: 'units.view' },
    { to: '/owners', icon: Users, key: 'owners', perm: 'owners.view' },
    { to: '/vehicles', icon: Car, key: 'vehicles', perm: 'vehicles.view' },
  ] },
  { group: 'finance', items: [
    { to: '/plans', icon: Layers, key: 'plans', perm: 'plans.view' },
    { to: '/subscriptions', icon: FileText, key: 'subscriptions', perm: 'subscriptions.view' },
    { to: '/renewals', icon: RefreshCw, key: 'renewals', perm: 'subscriptions.view' },
    { to: '/registration-requests', icon: UserPlus, key: 'registrationRequests', perm: 'payments.view' },
    { to: '/payments?status=pending_verification', icon: Inbox, key: 'renewalRequests', perm: 'payments.view' },
    { to: '/payments', icon: CreditCard, key: 'payments', perm: 'payments.view' },
    { to: '/operations', icon: Droplets, key: 'operations', perm: 'operations.view', soon: true },
    { to: '/staff', icon: UserCog, key: 'staff', perm: 'staff.view', soon: true },
    { to: '/sms', icon: MessageSquare, key: 'sms', perm: 'sms.view' },
    { to: '/reports', icon: BarChart3, key: 'reports', perm: 'reports.view', soon: true },
  ] },
  { group: 'system', items: [
    { to: '/users', icon: ShieldCheck, key: 'users', perm: 'users.manage' },
    { to: '/settings', icon: Settings, key: 'settings', perm: 'settings.manage' },
    { to: '/audit', icon: ScrollText, key: 'audit', perm: 'audit.view' },
  ] },
];

function Sidebar({ onNavigate }) {
  const { t } = useI18n(); const { can, company } = useAuth();
  return (
    <aside className="flex h-full w-64 flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 shadow-inner"><Droplets size={20} /></div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold leading-tight">{company?.name || t('app.name')}</p><p className="text-[11px] text-slate-400">{t('app.name')}</p></div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t(`nav.${g.group}`)}</p>
              <div className="space-y-0.5">
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end || i.to.includes('?')} onClick={onNavigate} className={({ isActive }) => { const qActive = i.to.includes('?') && window.location.pathname + window.location.search === i.to; const plainActive = isActive && !i.to.includes('?') && !(i.to === '/payments' && window.location.search.includes('status=pending_verification')); return `nav-item ${qActive || plainActive ? 'active' : ''} ${i.soon ? 'opacity-60' : ''} ${i.highlight && !isActive ? 'text-brand-300' : ''}`; }}>
                    <i.icon size={18} /><span className="flex-1">{t(`nav.${i.key}`)}</span>
                    {i.soon && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{t('nav.comingSoon')}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="px-5 py-3 text-[11px] text-slate-400 border-t border-white/10">v1.0 · Phase 1</div>
    </aside>
  );
}

function Notifications() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ data: [], unread: 0 });
  const ref = useRef();
  const load = async () => { try { const r = await api.get('/admin/notifications?limit=20'); setData(r.data); } catch { /* ignore */ } };
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, []);
  useEffect(() => { const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  const markAll = async () => { const ids = data.data.filter((n) => !n.isRead).map((n) => n.id); if (ids.length) { await api.post('/admin/notifications/read', { ids }); load(); } };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative btn-ghost p-2 rounded-lg"><Bell size={18} />{data.unread > 0 && <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{data.unread}</span>}</button>
      {open && (
        <div className="absolute end-0 mt-2 w-80 card shadow-xl z-30 fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200"><p className="text-sm font-semibold">{t('notifications.title')}</p>{data.unread > 0 && <button onClick={markAll} className="text-xs text-brand-600 hover:underline">{t('notifications.markAll')}</button>}</div>
          <div className="max-h-80 overflow-y-auto">
            {!data.data.length ? <p className="p-6 text-center text-sm text-slate-500">{t('notifications.empty')}</p>
              : data.data.map((n) => <div key={n.id} className={`px-4 py-3 border-b border-slate-100 text-sm ${n.isRead ? '' : 'bg-brand-50/60'}`}><p className="font-medium text-slate-800">{n.title}</p>{n.body && <p className="text-slate-500 text-xs mt-0.5">{n.body}</p>}<p className="text-[11px] text-slate-400 mt-1">{fmtDateTime(n.createdAt, lang)}</p></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef();
  useEffect(() => { const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); }; document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  return (
    <div className="flex h-full">
      <div className="hidden lg:block shrink-0 sticky top-0 h-screen"><Sidebar /></div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 start-0 shadow-2xl"><Sidebar onNavigate={() => setMobileOpen(false)} /></div>
          <button onClick={() => setMobileOpen(false)} className="absolute top-4 end-4 text-white"><X /></button>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6">
          <button className="btn-ghost p-2 lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="flex-1" />
          <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="btn-ghost btn-sm gap-1.5" title={t('common.language')}><Languages size={16} />{lang === 'en' ? 'العربية' : 'English'}</button>
          <Notifications />
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
              <span className="hidden sm:block text-start leading-tight"><span className="block text-sm font-medium text-slate-800">{user?.name}</span><span className="block text-[11px] text-slate-500">{user?.role}</span></span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {menu && (
              <div className="absolute end-0 mt-2 w-48 card shadow-xl py-1 z-30 fade-in">
                <button onClick={() => { setMenu(false); navigate('/settings#password'); }} className="block w-full text-start px-4 py-2 text-sm hover:bg-slate-50">{t('settings.changePassword')}</button>
                <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut size={15} />{t('auth.logout')}</button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-[1600px] w-full mx-auto"><Outlet /></main>
      </div>
    </div>
  );
}
