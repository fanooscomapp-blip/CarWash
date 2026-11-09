import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { useQuery, useDebounced, useLookups } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { PageHeader, DataTable, SearchInput, Select, StatusBadge, Tabs, Modal, Field, Input, Textarea, Spinner, useToast, Toggle, ConfirmDialog, Loading } from '../components/ui.jsx';

function UserForm({ open, onClose, initial, roles, onSaved }) {
  const { t } = useI18n(); const toast = useToast(); const lookups = useLookups();
  const [form, setForm] = useState({ name: initial?.name || '', email: initial?.email || '', mobile: initial?.mobile || '', password: '', roleId: initial?.roleId || '', userType: initial?.userType || 'admin', employeeCode: initial?.employeeCode || '', isActive: initial?.isActive ?? true, dateJoined: initial?.dateJoined || '', compoundIds: initial?.compoundIds || [] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const payload = { ...form, mobile: form.mobile || null, employeeCode: form.employeeCode || null, dateJoined: form.dateJoined || null }; if (!payload.password) delete payload.password;
      const { data } = initial?.id ? await api.put(`/admin/users/${initial.id}`, payload) : await api.post('/admin/users', payload);
      toast.success(t('common.success')); onSaved?.(data); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('users.edit') : t('users.add')}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="user-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="user-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label={t('common.name')} required><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label={t('common.email')} required><Input type="email" required dir="ltr" value={form.email} onChange={set('email')} /></Field>
        <Field label={t('common.mobile')}><Input dir="ltr" value={form.mobile} onChange={set('mobile')} /></Field>
        <Field label={initial?.id ? t('common.newPassword') : t('common.password')} required={!initial?.id}><Input type="password" required={!initial?.id} minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label={t('users.role')} required><Select required value={form.roleId} onChange={set('roleId')}><option value="">—</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label={t('users.type')}><Select value={form.userType} onChange={set('userType')}><option value="admin">{t('users.admin')}</option><option value="staff">{t('users.staff')}</option></Select></Field>
        {form.userType === 'staff' && <>
          <Field label={t('users.employeeCode')}><Input value={form.employeeCode} onChange={set('employeeCode')} /></Field>
          <Field label={t('users.dateJoined')}><Input type="date" value={form.dateJoined} onChange={set('dateJoined')} /></Field>
          <Field label={t('users.compounds')} className="sm:col-span-2"><div className="flex flex-wrap gap-2">{lookups.data?.activeCompounds.map((c) => { const on = form.compoundIds.includes(c.id); return <button type="button" key={c.id} onClick={() => setForm({ ...form, compoundIds: on ? form.compoundIds.filter((x) => x !== c.id) : [...form.compoundIds, c.id] })} className={`btn btn-sm ${on ? 'bg-navy-900 text-white' : 'btn-secondary'}`}>{c.name}</button>; })}</div></Field>
        </>}
        <div className="sm:col-span-2"><Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} /></div>
        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

function RoleForm({ open, onClose, initial, permissions, onSaved }) {
  const { t } = useI18n(); const toast = useToast();
  const [form, setForm] = useState({ name: initial?.name || '', description: initial?.description || '', permissions: initial?.permissions || [] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const all = form.permissions.includes('*');
  const groups = permissions.reduce((acc, p) => { (acc[p.group] ||= []).push(p); return acc; }, {});
  const toggle = (key) => setForm({ ...form, permissions: form.permissions.includes(key) ? form.permissions.filter((k) => k !== key) : [...form.permissions, key] });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const { data } = initial?.id ? await api.put(`/admin/users/roles/${initial.id}`, form) : await api.post('/admin/users/roles', form); toast.success(t('common.success')); onSaved?.(data); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? t('users.editRole') : t('users.addRole')} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button form="role-form" className="btn-primary" disabled={busy}>{busy && <Spinner />}{t('common.save')}</button></>}>
      <form id="role-form" onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4"><Field label={t('users.roleName')} required><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label={t('plans.description')}><Input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
        <Toggle checked={all} onChange={(v) => setForm({ ...form, permissions: v ? ['*'] : [] })} label={t('users.allPermissions')} />
        {!all && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{Object.entries(groups).map(([g, perms]) => (
          <div key={g} className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t(`users.groups.${g}`)}</p>
            <div className="space-y-1.5">{perms.map((p) => <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => toggle(p.key)} /><span className="font-mono text-xs">{p.key}</span></label>)}</div></div>))}</div>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

export default function UsersRoles() {
  const { t, lang } = useI18n(); const { can } = useAuth(); const toast = useToast();
  const [tab, setTab] = useState('users'); const [search, setSearch] = useState(''); const [userType, setUserType] = useState(''); const [page, setPage] = useState(1);
  const [userModal, setUserModal] = useState(null); const [roleModal, setRoleModal] = useState(null); const [delRole, setDelRole] = useState(null);
  const q = useDebounced(search);
  const users = useQuery('/admin/users', { search: q, userType, page, pageSize: 20 });
  const roles = useQuery('/admin/users/roles');
  const columns = [
    { key: 'name', header: t('common.name'), render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500" dir="ltr">{r.email}</p></div> },
    { key: 'roleName', header: t('users.role'), render: (r) => <span className="chip bg-navy-100 text-navy-800"><ShieldCheck size={12} />{r.roleName}</span> },
    { key: 'userType', header: t('users.type'), render: (r) => t(`users.${r.userType}`) },
    { key: 'compoundNames', header: t('users.compounds'), render: (r) => r.compoundNames || (r.userType === 'staff' ? '—' : '') },
    { key: 'lastLoginAt', header: t('users.lastLogin'), render: (r) => r.lastLoginAt ? fmtDateTime(r.lastLoginAt, lang) : '—' },
    { key: 'isActive', header: t('common.status'), render: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} label={r.isActive ? t('common.active') : t('common.inactive')} /> },
    { key: 'actions', header: '', className: 'text-end', render: (r) => can('users.manage', 'staff.manage') && <button className="btn-ghost btn-sm" onClick={() => setUserModal(r)}><Pencil size={14} />{t('common.edit')}</button> },
  ];
  const deleteRole = async () => { try { await api.delete(`/admin/users/roles/${delRole.id}`); toast.success(t('common.deleted')); setDelRole(null); roles.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="fade-in">
      <PageHeader title={t('users.title')} actions={tab === 'users' ? (can('users.manage', 'staff.manage') && <button className="btn-primary" onClick={() => setUserModal({})}><Plus size={16} />{t('users.add')}</button>) : (can('roles.manage') && <button className="btn-primary" onClick={() => setRoleModal({})}><Plus size={16} />{t('users.addRole')}</button>)} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'users', label: t('users.users'), count: users.data?.pagination.total }, { value: 'roles', label: t('users.roles'), count: roles.data?.roles.length }]} />
      {tab === 'users' && <>
        <div className="flex flex-wrap gap-2 mb-4"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} className="w-72" /><Select value={userType} onChange={(e) => { setUserType(e.target.value); setPage(1); }} className="w-40"><option value="">{t('common.all')}</option><option value="admin">{t('users.admin')}</option><option value="staff">{t('users.staff')}</option></Select></div>
        <DataTable columns={columns} rows={users.data?.data} loading={users.loading} error={users.error} onRetry={users.reload} pagination={users.data?.pagination} onPage={setPage} />
      </>}
      {tab === 'roles' && (!roles.data ? <Loading /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{roles.data.roles.map((r) => (
          <div key={r.id} className="card p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-navy-900">{r.name}</p><p className="text-xs text-slate-500">{r.description}</p></div>{r.isSystem && <span className="chip bg-slate-100 text-slate-600">{t('users.system')}</span>}</div>
            <div className="mt-3 flex flex-wrap gap-1">{r.permissions.includes('*') ? <span className="chip bg-navy-900 text-white">{t('users.allPermissions')}</span> : r.permissions.slice(0, 8).map((p) => <span key={p} className="chip bg-slate-100 text-slate-600 font-mono text-[10px]">{p}</span>)}{!r.permissions.includes('*') && r.permissions.length > 8 && <span className="chip bg-slate-100 text-slate-500">+{r.permissions.length - 8}</span>}</div>
            <div className="mt-auto pt-4 flex items-center justify-between text-xs text-slate-500"><span>{t('users.usersCount', { n: r.usersCount })}</span>
              {can('roles.manage') && <div className="flex gap-1">{!(r.isSystem && r.name === 'Super Admin') && <button className="btn-ghost btn-sm" onClick={() => setRoleModal(r)}><Pencil size={14} /></button>}{!r.isSystem && <button className="btn-ghost btn-sm text-red-600" onClick={() => setDelRole(r)}><Trash2 size={14} /></button>}</div>}</div>
          </div>))}</div>))}
      {userModal && roles.data && <UserForm open onClose={() => setUserModal(null)} initial={userModal.id ? userModal : null} roles={roles.data.roles} onSaved={users.reload} />}
      {roleModal && roles.data && <RoleForm open onClose={() => setRoleModal(null)} initial={roleModal.id ? roleModal : null} permissions={roles.data.permissions} onSaved={roles.reload} />}
      <ConfirmDialog open={!!delRole} onClose={() => setDelRole(null)} danger title={t('users.deleteRole')} message={t('users.deleteRoleConfirm')} onConfirm={deleteRole} />
    </div>
  );
}
