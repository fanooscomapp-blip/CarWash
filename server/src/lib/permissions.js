// Canonical permission catalogue. Roles hold an array of these keys; '*' grants everything.
export const PERMISSIONS = [
  { key: 'dashboard.view', group: 'dashboard' },
  { key: 'compounds.view', group: 'compounds' }, { key: 'compounds.manage', group: 'compounds' },
  { key: 'units.view', group: 'units' }, { key: 'units.manage', group: 'units' },
  { key: 'owners.view', group: 'owners' }, { key: 'owners.manage', group: 'owners' },
  { key: 'vehicles.view', group: 'vehicles' }, { key: 'vehicles.manage', group: 'vehicles' },
  { key: 'plans.view', group: 'plans' }, { key: 'plans.manage', group: 'plans' },
  { key: 'subscriptions.view', group: 'subscriptions' }, { key: 'subscriptions.manage', group: 'subscriptions' }, { key: 'subscriptions.renew', group: 'subscriptions' },
  { key: 'payments.view', group: 'payments' }, { key: 'payments.approve', group: 'payments' },
  { key: 'operations.view', group: 'operations' }, { key: 'operations.manage', group: 'operations' },
  { key: 'staff.view', group: 'staff' }, { key: 'staff.manage', group: 'staff' },
  { key: 'sms.view', group: 'sms' }, { key: 'sms.send', group: 'sms' },
  { key: 'reports.view', group: 'reports' },
  { key: 'users.manage', group: 'system' }, { key: 'roles.manage', group: 'system' },
  { key: 'settings.manage', group: 'system' }, { key: 'audit.view', group: 'system' },
  // staff portal (Phase 3)
  { key: 'tasks.view_own', group: 'staff_portal' }, { key: 'tasks.claim', group: 'staff_portal' }, { key: 'tasks.execute', group: 'staff_portal' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const SYSTEM_ROLES = {
  'Super Admin': { permissions: ['*'], description: 'Full access to everything' },
  'Operations Manager': {
    permissions: ['dashboard.view', 'compounds.view', 'compounds.manage', 'units.view', 'units.manage', 'owners.view', 'owners.manage', 'vehicles.view', 'vehicles.manage', 'plans.view', 'subscriptions.view', 'subscriptions.manage', 'subscriptions.renew', 'payments.view', 'operations.view', 'operations.manage', 'staff.view', 'staff.manage', 'sms.view', 'sms.send', 'reports.view'],
    description: 'Day-to-day operations without system administration',
  },
  'Finance': {
    permissions: ['dashboard.view', 'compounds.view', 'owners.view', 'vehicles.view', 'plans.view', 'plans.manage', 'subscriptions.view', 'payments.view', 'payments.approve', 'reports.view'],
    description: 'Payments approval and financial reports',
  },
  'Viewer': {
    permissions: ['dashboard.view', 'compounds.view', 'units.view', 'owners.view', 'vehicles.view', 'plans.view', 'subscriptions.view', 'payments.view', 'operations.view', 'staff.view', 'reports.view'],
    description: 'Read-only access',
  },
  'Car Wash Staff': { permissions: ['tasks.view_own', 'tasks.claim', 'tasks.execute'], description: 'Field staff – staff portal only' },
};

export function hasPermission(user, key) {
  const perms = user?.permissions || [];
  return perms.includes('*') || perms.includes(key);
}
