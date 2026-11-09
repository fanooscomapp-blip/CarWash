import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Home, Car, CalendarDays, Receipt, LogOut, Languages, Droplets } from 'lucide-react';
import { usePortal } from './portalLib.jsx';

export function PortalShell({ children, title, back }) {
  const { t, lang, setLang, company, owner, logout, loggedIn } = usePortal();
  return (
    <div className="min-h-full bg-slate-50 flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-20 bg-navy-900 text-white">
        <div className="mx-auto max-w-xl px-4 h-14 flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600"><Droplets size={18} /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold leading-tight">{lang === 'ar' && company?.nameAr ? company.nameAr : company?.name || t('brand')}</p><p className="text-[11px] text-slate-300">{t('brand')}</p></div>
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="rounded-md px-2 py-1 text-xs hover:bg-white/10 flex items-center gap-1"><Languages size={14} />{t('lang')}</button>
          {loggedIn && <button onClick={logout} className="rounded-md p-1.5 hover:bg-white/10" title={t('logout')}><LogOut size={16} /></button>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4 pb-24">{children ?? <Outlet />}</main>
      {loggedIn && (
        <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-xl grid grid-cols-4">
            {[['/p/home', Home, 'home'], ['/p/vehicles', Car, 'myVehicles'], ['/p/washes', CalendarDays, 'washes'], ['/p/requests', Receipt, 'requests']].map(([to, Icon, k]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-slate-500'}`}><Icon size={20} />{t(k)}</NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

export function RequireOwner({ children }) {
  const { loggedIn } = usePortal(); const loc = useLocation();
  if (!loggedIn) return <Navigate to="/p/login" replace state={{ from: loc }} />;
  return children;
}

export function Card({ children, className = '', onClick }) {
  return <div onClick={onClick} className={`rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(16,24,40,0.06)] ${onClick ? 'active:scale-[0.99] transition-transform cursor-pointer' : ''} ${className}`}>{children}</div>;
}
export function BigButton({ children, className = '', ...props }) {
  return <button {...props} className={`w-full rounded-xl px-4 py-3.5 text-base font-semibold transition-colors disabled:opacity-50 ${className}`}>{children}</button>;
}
export function Spinner() { return <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />; }
export function Center({ children }) { return <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 gap-3">{children}</div>; }
