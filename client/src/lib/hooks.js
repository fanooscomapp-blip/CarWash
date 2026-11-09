import { useCallback, useEffect, useRef, useState } from 'react';
import { api, qs } from './api.js';

// Generic data loader with reload + debounced params
export function useQuery(url, params, { enabled = true, debounce = 0 } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const key = url + qs(params);
  const timer = useRef();
  const load = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try { const { data } = await api.get(key); setState({ data, loading: false, error: null }); }
    catch (error) { setState({ data: null, loading: false, error }); }
  }, [key, enabled]);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, debounce);
    return () => clearTimeout(timer.current);
  }, [load, debounce]);
  return { ...state, reload: load };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useLookups() {
  const q = useQuery('/admin/lookups');
  // Forms that create something should only offer active compounds; filters keep all of them
  const data = q.data ? { ...q.data, activeCompounds: (q.data.compounds || []).filter((c) => c.status !== 'inactive') } : q.data;
  return { ...q, data };
}
