import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, company: null });

  const loadMe = useCallback(async () => {
    if (!localStorage.getItem('cw_token') && !sessionStorage.getItem('cw_token')) return setState({ loading: false, user: null, company: null });
    try {
      const { data } = await api.get('/auth/me');
      setState({ loading: false, user: data.user, company: data.company });
    } catch {
      localStorage.removeItem('cw_token'); sessionStorage.removeItem('cw_token');
      setState({ loading: false, user: null, company: null });
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => {
    const onLogout = () => setState({ loading: false, user: null, company: null });
    window.addEventListener('cw:logout', onLogout);
    return () => window.removeEventListener('cw:logout', onLogout);
  }, []);

  // remember=true → 30-day token kept in localStorage; otherwise a 12h token that dies with the browser tab/session
  const login = async (email, password, remember = false) => {
    const { data } = await api.post('/auth/login', { email, password, remember });
    localStorage.removeItem('cw_token'); sessionStorage.removeItem('cw_token');
    (remember ? localStorage : sessionStorage).setItem('cw_token', data.token);
    setState({ loading: false, user: data.user, company: data.company });
    return data;
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('cw_token'); sessionStorage.removeItem('cw_token');
    setState({ loading: false, user: null, company: null });
  };
  const can = useCallback((...keys) => {
    const perms = state.user?.permissions || [];
    return perms.includes('*') || keys.some((k) => perms.includes(k));
  }, [state.user]);

  const value = useMemo(() => ({ ...state, login, logout, can, refresh: loadMe, setCompany: (company) => setState((s) => ({ ...s, company })) }), [state, can, loadMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
