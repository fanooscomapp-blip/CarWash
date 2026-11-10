import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, AlertCircle, CheckCircle2, Inbox, Search, Trash2 } from 'lucide-react';
import { useT, useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';

// ───────── Status badge ─────────
const STATUS_STYLES = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', renewed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  expiring_soon: 'bg-orange-50 text-orange-700 ring-orange-600/20', pending_payment: 'bg-orange-50 text-orange-700 ring-orange-600/20', pending_verification: 'bg-orange-50 text-orange-700 ring-orange-600/20', pending: 'bg-orange-50 text-orange-700 ring-orange-600/20', awaiting_new_receipt: 'bg-orange-50 text-orange-700 ring-orange-600/20', in_progress: 'bg-blue-50 text-blue-700 ring-blue-600/20', assigned: 'bg-blue-50 text-blue-700 ring-blue-600/20', accepted: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  expired: 'bg-red-50 text-red-700 ring-red-600/20', rejected: 'bg-red-50 text-red-700 ring-red-600/20', cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20', suspended: 'bg-slate-100 text-slate-600 ring-slate-500/20', inactive: 'bg-slate-100 text-slate-600 ring-slate-500/20', issue_reported: 'bg-red-50 text-red-700 ring-red-600/20',
};
export function StatusBadge({ status, label }) {
  const t = useT();
  if (!status) return <span className="chip bg-slate-100 text-slate-500 ring-1 ring-slate-500/20">{t('status.none')}</span>;
  return <span className={`chip ring-1 ring-inset ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-500/20'}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{label || t(`status.${status}`)}</span>;
}

// ───────── Buttons / page header ─────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div><h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>{subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className = '' }) { return <Loader2 className={`animate-spin ${className}`} size={18} />; }

export function Loading({ rows = 6 }) {
  return <div className="space-y-2 p-4">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}</div>;
}

export function ErrorBox({ error, onRetry }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertCircle size={18} /><span className="flex-1">{error?.message || t('common.error')}</span>
      {onRetry && <button onClick={onRetry} className="btn-secondary btn-sm">{t('common.retry')}</button>}
    </div>
  );
}

export function Empty({ title, hint, action }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center text-slate-500">
      <Inbox size={36} className="text-slate-300 mb-3" />
      <p className="font-medium text-slate-700">{title || t('common.noResults')}</p>
      {hint && <p className="text-sm mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ───────── Modal ─────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl fade-in max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-md"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger, reasonLabel, confirmLabel, loading }) {
  const t = useT();
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={loading || (reasonLabel && !reason.trim())} onClick={() => onConfirm(reason)}>{loading && <Spinner />}{confirmLabel || t('common.confirm')}</button></>}>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {reasonLabel && <div className="mt-4"><label className="label">{reasonLabel}</label><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
    </Modal>
  );
}

// ───────── Toasts ─────────
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, type, message }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000);
  }, []);
  const api = { success: (m) => push('success', m), error: (m) => push('error', m) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((x) => (
          <div key={x.id} className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg fade-in ${x.type === 'error' ? 'bg-red-600 text-white' : 'bg-navy-900 text-white'}`}>
            {x.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{x.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ───────── Forms ─────────
export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}{required && <span className="text-red-500 ms-0.5">*</span>}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
export const Input = (props) => <input {...props} className={`input ${props.className || ''}`} />;
export const Textarea = (props) => <textarea {...props} className={`input ${props.className || ''}`} />;
export const Select = ({ children, ...props }) => <select {...props} className={`input ${props.className || ''}`}>{children}</select>;

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'start-[18px]' : 'start-0.5'}`} />
      </button>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

export function DaysPicker({ value = [], onChange }) {
  const t = useT();
  const days = t('common.weekdays');
  const order = [6, 0, 1, 2, 3, 4, 5]; // Sat-first (regional week)
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((d) => {
        const on = value.includes(d);
        return <button type="button" key={d} onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${on ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{days[d]}</button>;
      })}
    </div>
  );
}

// ───────── Tabs / pagination / search ─────────
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-4">
      {tabs.map((tab) => (
        <button key={tab.value} onClick={() => onChange(tab.value)}
          className={`flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${value === tab.value ? 'border-brand-600 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          {tab.label}{tab.count !== undefined && <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${value === tab.value ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  const t = useT(); const { isRtl } = useI18n();
  if (!pagination || pagination.total === 0) return null;
  const { page, pageSize, total, totalPages } = pagination;
  const Prev = isRtl ? ChevronRight : ChevronLeft, Next = isRtl ? ChevronLeft : ChevronRight;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-500 border-t border-slate-200">
      <span>{t('common.showing', { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}</span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><Prev size={16} /></button>
        <span className="px-2 font-medium text-slate-700">{page} / {totalPages}</span>
        <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><Next size={16} /></button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className = '' }) {
  const t = useT();
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
      <input className="input ps-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || t('common.search')} />
    </div>
  );
}

// ───────── Data table ─────────
export function DataTable({ columns, rows, loading, error, onRetry, emptyTitle, emptyHint, pagination, onPage, rowKey = 'id', onRowClick, pinFirst = true }) {
  // The actions column (key "actions" or sticky:true) stays visible at the inline end; the first column stays at the start
  const cellClass = (c, i) => [c.className, (c.key === 'actions' || c.sticky) && 'sticky-end', pinFirst && i === 0 && columns.length > 3 && 'sticky-start'].filter(Boolean).join(' ');
  if (error) return <div className="p-4"><ErrorBox error={error} onRetry={onRetry} /></div>;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr>{columns.map((c, i) => <th key={c.key} className={cellClass(c, i)}>{c.header}</th>)}</tr></thead>
          <tbody>
            {loading && !rows ? <tr><td colSpan={columns.length}><Loading /></td></tr>
              : !rows?.length ? <tr><td colSpan={columns.length}><Empty title={emptyTitle} hint={emptyHint} /></td></tr>
              : rows.map((r) => (
                <tr key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>
                  {columns.map((c, i) => <td key={c.key} className={cellClass(c, i)}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} onPage={onPage} />
    </div>
  );
}

export function KpiCard({ label, value, hint, tone = 'default', icon: Icon, onClick }) {
  const tones = { default: 'text-navy-900', success: 'text-emerald-600', warning: 'text-orange-600', danger: 'text-red-600', info: 'text-brand-600' };
  return (
    <div onClick={onClick} className={`card p-4 ${onClick ? 'cursor-pointer hover:border-brand-500/50 transition-colors' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 leading-snug">{label}</p>
        {Icon && <Icon size={16} className="text-slate-400 shrink-0" />}
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function DescriptionList({ items, cols = 2 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-3 text-sm ${cols === 3 ? 'sm:grid-cols-3' : cols === 1 ? '' : 'sm:grid-cols-2'}`}>
      {items.filter(Boolean).map(([k, v]) => <div key={k}><dt className="text-xs font-medium text-slate-500">{k}</dt><dd className="mt-0.5 text-slate-800 break-words">{v ?? '—'}</dd></div>)}
    </dl>
  );
}

// Typeahead that loads options from an API url with ?q=
export function AsyncSelect({ fetchOptions, value, onChange, renderOption, placeholder, disabled }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const box = useRef();
  useEffect(() => {
    if (!open) return;
    let alive = true; setLoading(true);
    const t = setTimeout(async () => { try { const r = await fetchOptions(q); if (alive) setOptions(r); } finally { if (alive) setLoading(false); } }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, fetchOptions]);
  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className="relative" ref={box}>
      {value ? (
        <div className="input flex items-center justify-between gap-2">
          <span className="truncate">{renderOption(value)}</span>
          {!disabled && <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => onChange(null)}><X size={14} /></button>}
        </div>
      ) : (
        <input className="input" disabled={disabled} value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      )}
      {open && !value && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && <div className="p-3 text-sm text-slate-500 flex items-center gap-2"><Spinner />…</div>}
          {!loading && !options.length && <div className="p-3 text-sm text-slate-500">—</div>}
          {options.map((o) => <button type="button" key={o.id} onClick={() => { onChange(o); setOpen(false); setQ(''); }} className="block w-full text-start px-3 py-2 text-sm hover:bg-slate-50">{renderOption(o)}</button>)}
        </div>
      )}
    </div>
  );
}

/** Trash button + confirmation; calls DELETE url and reports the server's reason when the record is still referenced. */
export function DeleteButton({ url, name, onDone, label, className = '', iconOnly = true }) {
  const { t } = useI18n(); const toast = useToast();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await api.delete(url); toast.success(t('common.deleted')); setOpen(false); onDone?.(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <>
      <button type="button" className={`btn-ghost btn-sm text-red-600 hover:bg-red-50 ${className}`} title={t('common.delete')} onClick={(e) => { e.stopPropagation(); setOpen(true); }}><Trash2 size={15} />{!iconOnly && (label || t('common.delete'))}</button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={run} loading={busy} danger title={t('common.delete')} message={t('common.deleteConfirm', { name: name || '' })} confirmLabel={t('common.delete')} />
    </>
  );
}
