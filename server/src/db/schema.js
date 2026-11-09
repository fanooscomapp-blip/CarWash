import {
  pgTable, uuid, varchar, text, integer, boolean, timestamp, date, numeric, jsonb, primaryKey, uniqueIndex, index, doublePrecision,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

const ts = (name) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').defaultNow().notNull();
const updatedAt = () => ts('updated_at').defaultNow().notNull();

// ───────────────────────── Tenancy & access ─────────────────────────
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  nameAr: varchar('name_ar', { length: 200 }),
  currency: varchar('currency', { length: 10 }).default('EGP').notNull(),
  timezone: varchar('timezone', { length: 60 }).default('Africa/Cairo').notNull(),
  language: varchar('language', { length: 5 }).default('en').notNull(),
  dateFormat: varchar('date_format', { length: 20 }).default('DD/MM/YYYY').notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: createdAt(),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  permissions: jsonb('permissions').$type().default([]).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('roles_company_name').on(t.companyId, t.name)]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  roleId: uuid('role_id').references(() => roles.id).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  email: varchar('email', { length: 200 }).notNull(),
  mobile: varchar('mobile', { length: 30 }),
  passwordHash: text('password_hash').notNull(),
  userType: varchar('user_type', { length: 20 }).default('admin').notNull(), // admin | staff
  employeeCode: varchar('employee_code', { length: 40 }),
  isActive: boolean('is_active').default(true).notNull(),
  dateJoined: date('date_joined'),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_company_email').on(t.companyId, t.email)]);

export const staffCompounds = pgTable('staff_compounds', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id, { onDelete: 'cascade' }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.compoundId] })]);

export const settings = pgTable('settings', {
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  key: varchar('key', { length: 80 }).notNull(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.companyId, t.key] })]);

// ───────────────────────── Core domain ─────────────────────────
export const compounds = pgTable('compounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  code: varchar('code', { length: 40 }).notNull(),
  address: text('address'),
  contactPerson: varchar('contact_person', { length: 150 }),
  contactMobile: varchar('contact_mobile', { length: 30 }),
  unitsCount: integer('units_count').default(0).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // active | inactive
  notes: text('notes'),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('compounds_company_code').on(t.companyId, t.code)]);

export const owners = pgTable('owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  mobile: varchar('mobile', { length: 30 }).notNull(),
  altMobile: varchar('alt_mobile', { length: 30 }),
  email: varchar('email', { length: 200 }),
  notes: text('notes'),
  portalToken: varchar('portal_token', { length: 80 }),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('owners_company_mobile').on(t.companyId, t.mobile), uniqueIndex('owners_portal_token').on(t.portalToken)]);

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id).notNull(),
  ownerId: uuid('owner_id').references(() => owners.id).notNull(),
  unitNumber: varchar('unit_number', { length: 40 }).notNull(),
  notes: text('notes'),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('units_compound_number').on(t.compoundId, t.unitNumber)]);

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  vehicleCode: varchar('vehicle_code', { length: 20 }).notNull(), // system generated e.g. VH-000123
  plateNumber: varchar('plate_number', { length: 40 }).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id).notNull(),
  unitId: uuid('unit_id').references(() => units.id).notNull(),
  ownerId: uuid('owner_id').references(() => owners.id).notNull(),
  brand: varchar('brand', { length: 80 }),
  model: varchar('model', { length: 80 }),
  color: varchar('color', { length: 40 }),
  vehicleType: varchar('vehicle_type', { length: 30 }).default('sedan').notNull(),
  registrationDate: date('registration_date').defaultNow(),
  photoPath: text('photo_path'),
  parkingLocation: varchar('parking_location', { length: 200 }), // e.g. "Garage B, level -1, bay 23"
  gpsLat: doublePrecision('gps_lat'),
  gpsLng: doublePrecision('gps_lng'),
  notes: text('notes'),
  status: varchar('status', { length: 20 }).default('active').notNull(), // active | inactive
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('vehicles_company_code').on(t.companyId, t.vehicleCode),
  uniqueIndex('vehicles_company_plate').on(t.companyId, t.plateNumber),
  index('vehicles_unit').on(t.unitId),
]);

export const qrCodes = pgTable('qr_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }).notNull(),
  token: varchar('token', { length: 80 }).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('qr_token').on(t.token), uniqueIndex('qr_vehicle').on(t.vehicleId)]);

// ───────────────────────── Subscriptions ─────────────────────────
export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  nameAr: varchar('name_ar', { length: 150 }),
  planType: varchar('plan_type', { length: 20 }).notNull(), // weekly|monthly|quarterly|semi_annual|annual|custom
  durationDays: integer('duration_days').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  allowedDays: jsonb('allowed_days').$type().default([0, 1, 2, 3, 4, 5, 6]).notNull(), // 0=Sun..6=Sat
  maxFrequencyPerWeek: integer('max_frequency_per_week').default(7).notNull(),
  maxWashes: integer('max_washes').notNull(),
  scope: varchar('scope', { length: 20 }).default('per_vehicle').notNull(), // per_vehicle|per_unit|multi_vehicle
  maxVehicles: integer('max_vehicles').default(1).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Compound-specific and vehicle-type-specific price overrides
export const planPrices = pgTable('plan_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').references(() => subscriptionPlans.id, { onDelete: 'cascade' }).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id, { onDelete: 'cascade' }),
  vehicleType: varchar('vehicle_type', { length: 30 }),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  subscriptionCode: varchar('subscription_code', { length: 20 }).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id).notNull(),
  unitId: uuid('unit_id').references(() => units.id).notNull(),
  ownerId: uuid('owner_id').references(() => owners.id).notNull(),
  planId: uuid('plan_id').references(() => subscriptionPlans.id).notNull(),
  planSnapshot: jsonb('plan_snapshot').notNull(), // frozen copy of plan at creation
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  durationDays: integer('duration_days').notNull(),
  washesAllowed: integer('washes_allowed').notNull(),
  washesUsed: integer('washes_used').default(0).notNull(),
  allowedDays: jsonb('allowed_days').$type().notNull(),
  frequencyPerWeek: integer('frequency_per_week').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 12, scale: 2 }).default('0').notNull(),
  finalAmount: numeric('final_amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 30 }).default('bank_transfer').notNull(),
  paymentStatus: varchar('payment_status', { length: 30 }).default('pending').notNull(), // pending|paid|rejected
  status: varchar('status', { length: 30 }).default('pending_payment').notNull(), // pending_payment|active|expiring_soon|expired|suspended|cancelled
  statusReason: text('status_reason'),
  notes: text('notes'),
  renewedFromId: uuid('renewed_from_id'),
  renewalToken: varchar('renewal_token', { length: 80 }),            // secure link token for the owner's renewal page
  renewalTokenExpiresAt: ts('renewal_token_expires_at'),
  createdBy: uuid('created_by').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('subscriptions_company_code').on(t.companyId, t.subscriptionCode),
  index('subscriptions_status').on(t.companyId, t.status),
  index('subscriptions_end').on(t.companyId, t.endDate),
  index('subscriptions_renewed_from').on(t.renewedFromId),
  uniqueIndex('subscriptions_renewal_token').on(t.renewalToken),
]);

// One row per reminder actually sent, so the automation never sends the same reminder twice
export const subscriptionReminders = pgTable('subscription_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
  kind: varchar('kind', { length: 30 }).notNull(), // before_3 | before_7 | on_expiry | after_3 | manual
  smsLogId: uuid('sms_log_id'),
  sentAt: createdAt(),
}, (t) => [uniqueIndex('reminder_once').on(t.subscriptionId, t.kind)]);

// Owner portal sessions (issued after OTP). Revocable, device-bound by token.
export const ownerSessions = pgTable('owner_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => owners.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  expiresAt: ts('expires_at').notNull(),
  lastSeenAt: ts('last_seen_at'),
  userAgent: varchar('user_agent', { length: 300 }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('owner_sessions_token').on(t.tokenHash), index('owner_sessions_owner').on(t.ownerId)]);

export const subscriptionVehicles = pgTable('subscription_vehicles', {
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }).notNull(),
}, (t) => [primaryKey({ columns: [t.subscriptionId, t.vehicleId] }), index('subvehicles_vehicle').on(t.vehicleId)]);

export const subscriptionRenewals = pgTable('subscription_renewals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  renewalCode: varchar('renewal_code', { length: 20 }).notNull(),
  previousSubscriptionId: uuid('previous_subscription_id').references(() => subscriptions.id).notNull(),
  newSubscriptionId: uuid('new_subscription_id').references(() => subscriptions.id),
  requestedBy: varchar('requested_by', { length: 20 }).notNull(), // admin | owner
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
  status: varchar('status', { length: 30 }).default('pending').notNull(), // pending|approved|rejected|completed|cancelled
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────── Payments ─────────────────────────
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  paymentCode: varchar('payment_code', { length: 20 }).notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id).notNull(),
  renewalId: uuid('renewal_id').references(() => subscriptionRenewals.id),
  ownerId: uuid('owner_id').references(() => owners.id).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  method: varchar('method', { length: 30 }).notNull(), // bank_transfer|cash|other
  paymentDate: date('payment_date'),
  status: varchar('status', { length: 30 }).default('pending_verification').notNull(), // pending_verification|approved|rejected|awaiting_new_receipt
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: ts('approved_at'),
  rejectionReason: text('rejection_reason'),
  notes: text('notes'),
  ownerNote: text('owner_note'),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('payments_company_code').on(t.companyId, t.paymentCode), index('payments_status').on(t.companyId, t.status)]);

export const paymentReceipts = pgTable('payment_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }).notNull(),
  filePath: text('file_path').notNull(),
  originalName: varchar('original_name', { length: 255 }),
  mimeType: varchar('mime_type', { length: 80 }),
  sizeBytes: integer('size_bytes'),
  uploadedByType: varchar('uploaded_by_type', { length: 20 }).notNull(), // owner | admin
  uploadedAt: createdAt(),
});

// ───────────────────────── Washing operations ─────────────────────────
export const washingSchedules = pgTable('washing_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  generated: boolean('generated').default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('schedule_vehicle_date').on(t.vehicleId, t.scheduledDate)]);

export const washingTasks = pgTable('washing_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  taskCode: varchar('task_code', { length: 20 }).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id).notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id).notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  assignedTo: uuid('assigned_to').references(() => users.id),
  isPublished: boolean('is_published').default(false).notNull(),
  priority: integer('priority').default(0).notNull(),
  status: varchar('status', { length: 30 }).default('assigned').notNull(), // assigned|accepted|in_progress|completed|issue_reported|cancelled
  cancelReason: text('cancel_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('task_vehicle_date_active').on(t.vehicleId, t.scheduledDate).where(sql`${t.status} <> 'cancelled'`),
  index('tasks_company_date').on(t.companyId, t.scheduledDate),
]);

export const washingOperations = pgTable('washing_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  taskId: uuid('task_id').references(() => washingTasks.id).notNull(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id).notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id).notNull(),
  staffId: uuid('staff_id').references(() => users.id).notNull(),
  startTime: ts('start_time'),
  endTime: ts('end_time'),
  startLat: doublePrecision('start_lat'),
  startLng: doublePrecision('start_lng'),
  endLat: doublePrecision('end_lat'),
  endLng: doublePrecision('end_lng'),
  notes: text('notes'),
  issueReported: boolean('issue_reported').default(false).notNull(),
  issueDescription: text('issue_description'),
  status: varchar('status', { length: 30 }).default('in_progress').notNull(), // in_progress|completed|flagged|approved|cancelled
  quotaConsumed: boolean('quota_consumed').default(false).notNull(),
  adminReviewedBy: uuid('admin_reviewed_by').references(() => users.id),
  adminReviewedAt: ts('admin_reviewed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('operation_task').on(t.taskId)]);

export const washPhotos = pgTable('wash_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  operationId: uuid('operation_id').references(() => washingOperations.id, { onDelete: 'cascade' }).notNull(),
  phase: varchar('phase', { length: 10 }).notNull(), // before | after
  filePath: text('file_path').notNull(),
  mimeType: varchar('mime_type', { length: 80 }),
  takenAt: ts('taken_at'),
  uploadedAt: createdAt(),
  isOriginal: boolean('is_original').default(true).notNull(),
});

// ───────────────────────── Notifications, SMS, OTP, audit ─────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: createdAt(),
}, (t) => [index('notifications_company').on(t.companyId, t.isRead)]);

export const smsTemplates = pgTable('sms_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  key: varchar('key', { length: 60 }).notNull(),
  lang: varchar('lang', { length: 5 }).notNull(),
  body: text('body').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('sms_templates_key_lang').on(t.companyId, t.key, t.lang)]);

export const smsLogs = pgTable('sms_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  toMobile: varchar('to_mobile', { length: 30 }).notNull(),
  ownerId: uuid('owner_id').references(() => owners.id),
  templateKey: varchar('template_key', { length: 60 }),
  body: text('body').notNull(),
  status: varchar('status', { length: 30 }).default('queued').notNull(), // queued|sent|failed|not_configured
  providerResponse: jsonb('provider_response'),
  sentAt: ts('sent_at'),
  createdAt: createdAt(),
});

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  ownerId: uuid('owner_id').references(() => owners.id, { onDelete: 'cascade' }).notNull(),
  mobile: varchar('mobile', { length: 30 }).notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
});

// Self-registration requests from the public join page. Nothing is written to owners/units/vehicles until an admin approves.
export const registrationRequests = pgTable('registration_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  requestCode: varchar('request_code', { length: 20 }).notNull(),
  compoundId: uuid('compound_id').references(() => compounds.id).notNull(),
  ownerName: varchar('owner_name', { length: 200 }).notNull(),
  mobile: varchar('mobile', { length: 30 }).notNull(),
  unitNumber: varchar('unit_number', { length: 40 }).notNull(),
  vehicles: jsonb('vehicles').notNull(),            // [{ plateNumber, brand, model, color, vehicleType }]
  planId: uuid('plan_id').references(() => subscriptionPlans.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  receiptPath: text('receipt_path').notNull(),
  receiptMime: varchar('receipt_mime', { length: 80 }),
  note: text('note'),
  status: varchar('status', { length: 30 }).default('pending').notNull(), // pending | approved | rejected
  rejectionReason: text('rejection_reason'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: ts('reviewed_at'),
  resultOwnerId: uuid('result_owner_id').references(() => owners.id),
  resultSubscriptionId: uuid('result_subscription_id').references(() => subscriptions.id),
  statusToken: varchar('status_token', { length: 80 }).notNull(), // lets the applicant check status without login
  ip: varchar('ip', { length: 60 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('regreq_company_code').on(t.companyId, t.requestCode), uniqueIndex('regreq_status_token').on(t.statusToken), index('regreq_status').on(t.companyId, t.status)]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 20 }).default('user').notNull(), // user | owner | system
  action: varchar('action', { length: 60 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason'),
  ip: varchar('ip', { length: 60 }),
  createdAt: createdAt(),
}, (t) => [index('audit_company_created').on(t.companyId, t.createdAt)]);

export const sequences = pgTable('sequences', {
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  key: varchar('key', { length: 20 }).notNull(),
  value: integer('value').default(0).notNull(),
}, (t) => [primaryKey({ columns: [t.companyId, t.key] })]);

// ───────────────────────── Relations (for relational queries) ─────────────────────────
export const compoundsRelations = relations(compounds, ({ many }) => ({ units: many(units), vehicles: many(vehicles) }));
export const ownersRelations = relations(owners, ({ many }) => ({ units: many(units), vehicles: many(vehicles), subscriptions: many(subscriptions) }));
export const unitsRelations = relations(units, ({ one, many }) => ({
  compound: one(compounds, { fields: [units.compoundId], references: [compounds.id] }),
  owner: one(owners, { fields: [units.ownerId], references: [owners.id] }),
  vehicles: many(vehicles),
}));
export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  compound: one(compounds, { fields: [vehicles.compoundId], references: [compounds.id] }),
  unit: one(units, { fields: [vehicles.unitId], references: [units.id] }),
  owner: one(owners, { fields: [vehicles.ownerId], references: [owners.id] }),
  subscriptionVehicles: many(subscriptionVehicles),
}));
export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  compound: one(compounds, { fields: [subscriptions.compoundId], references: [compounds.id] }),
  unit: one(units, { fields: [subscriptions.unitId], references: [units.id] }),
  owner: one(owners, { fields: [subscriptions.ownerId], references: [owners.id] }),
  plan: one(subscriptionPlans, { fields: [subscriptions.planId], references: [subscriptionPlans.id] }),
  vehicles: many(subscriptionVehicles),
  payments: many(payments),
}));
export const subscriptionVehiclesRelations = relations(subscriptionVehicles, ({ one }) => ({
  subscription: one(subscriptions, { fields: [subscriptionVehicles.subscriptionId], references: [subscriptions.id] }),
  vehicle: one(vehicles, { fields: [subscriptionVehicles.vehicleId], references: [vehicles.id] }),
}));
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  subscription: one(subscriptions, { fields: [payments.subscriptionId], references: [subscriptions.id] }),
  owner: one(owners, { fields: [payments.ownerId], references: [owners.id] }),
  compound: one(compounds, { fields: [payments.compoundId], references: [compounds.id] }),
  receipts: many(paymentReceipts),
}));
export const paymentReceiptsRelations = relations(paymentReceipts, ({ one }) => ({
  payment: one(payments, { fields: [paymentReceipts.paymentId], references: [payments.id] }),
}));
export const plansRelations = relations(subscriptionPlans, ({ many }) => ({ prices: many(planPrices) }));
export const planPricesRelations = relations(planPrices, ({ one }) => ({
  plan: one(subscriptionPlans, { fields: [planPrices.planId], references: [subscriptionPlans.id] }),
  compound: one(compounds, { fields: [planPrices.compoundId], references: [compounds.id] }),
}));
export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  staffCompounds: many(staffCompounds),
}));
export const staffCompoundsRelations = relations(staffCompounds, ({ one }) => ({
  user: one(users, { fields: [staffCompounds.userId], references: [users.id] }),
  compound: one(compounds, { fields: [staffCompounds.compoundId], references: [compounds.id] }),
}));
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));
