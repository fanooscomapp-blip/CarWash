import { useNavigate } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { fmtDate, fmtMoney } from '../lib/format.js';
import { DataTable, StatusBadge } from './ui.jsx';

// Compact subscription history table reused in owner / unit / vehicle detail pages
export default function SubscriptionTable({ rows, loading, error, showVehicles = true }) {
  const { t, lang } = useI18n(); const { company } = useAuth(); const navigate = useNavigate();
  const cur = company?.currency || 'EGP';
  const columns = [
    { key: 'subscriptionCode', header: t('subs.code'), render: (r) => <span className="font-mono text-xs">{r.subscriptionCode}</span> },
    { key: 'planName', header: t('subs.plan'), render: (r) => r.planName || r.planSnapshot?.name },
    ...(showVehicles ? [{ key: 'plates', header: t('common.vehicles'), render: (r) => <span dir="ltr">{r.plates || '—'}</span> }] : []),
    { key: 'period', header: t('subs.period'), render: (r) => <span className="whitespace-nowrap">{fmtDate(r.startDate, lang)} → {fmtDate(r.endDate, lang)}</span> },
    { key: 'washes', header: t('subs.washes'), render: (r) => `${r.washesUsed} / ${r.washesAllowed}` },
    { key: 'finalAmount', header: t('subs.finalAmount'), render: (r) => fmtMoney(r.finalAmount, cur, lang) },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
  ];
  return <DataTable columns={columns} rows={rows} loading={loading} error={error} onRowClick={(r) => navigate(`/subscriptions/${r.id}`)} />;
}

export function PaymentTable({ rows, loading }) {
  const { t, lang } = useI18n(); const { company } = useAuth(); const navigate = useNavigate();
  const cur = company?.currency || 'EGP';
  const columns = [
    { key: 'paymentCode', header: t('payments.code'), render: (r) => <span className="font-mono text-xs">{r.paymentCode}</span> },
    { key: 'subscriptionCode', header: t('subs.code'), render: (r) => <span className="font-mono text-xs">{r.subscriptionCode}</span> },
    { key: 'amount', header: t('common.amount'), render: (r) => fmtMoney(r.amount, cur, lang) },
    { key: 'method', header: t('payments.method'), render: (r) => t(`subs.methods.${r.method}`) },
    { key: 'paymentDate', header: t('common.date'), render: (r) => fmtDate(r.paymentDate || r.createdAt, lang) },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
  ];
  return <DataTable columns={columns} rows={rows} loading={loading} onRowClick={(r) => navigate(`/payments?search=${r.paymentCode}`)} />;
}
