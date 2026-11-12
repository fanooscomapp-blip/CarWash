import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('cw_token') || sessionStorage.getItem('cw_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('cw_token'); sessionStorage.removeItem('cw_token');
      window.dispatchEvent(new Event('cw:logout'));
    }
    const payload = err.response?.data?.error;
    const e = new Error(payload?.message || err.message || 'Request failed');
    e.code = payload?.code; e.status = status; e.details = payload?.details;
    return Promise.reject(e);
  },
);

export const qs = (params) => {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.set(k, v); });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const fileUrl = (path) => path; // same-origin authenticated streaming endpoints
