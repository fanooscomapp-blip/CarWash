import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { db, pool, schema } from './index.js';
import { config } from '../lib/config.js';
import { SYSTEM_ROLES } from '../lib/permissions.js';
import { nextCode, addDays, today } from '../lib/util.js';
import { createSubscription, renewSubscription } from '../services/subscriptionService.js';

const SMS_TEMPLATES = [
  ['expiry_reminder', 'en', 'Dear Customer, your car wash subscription for vehicle {VehicleNumber}, Unit {UnitNumber}, Compound {CompoundName}, will expire on {ExpiryDate}. Renew your subscription using the secure link below: {RenewalLink}'],
  ['expiry_reminder', 'ar', 'عزيزي العميل، اشتراك غسيل السيارة للمركبة {VehicleNumber}، وحدة {UnitNumber}، كمبوند {CompoundName}، ينتهي بتاريخ {ExpiryDate}. جدد اشتراكك عبر الرابط الآمن: {RenewalLink}'],
  ['expired', 'en', 'Your car wash subscription for vehicle {VehicleNumber} expired on {ExpiryDate}. Renew now: {RenewalLink}'],
  ['expired', 'ar', 'انتهى اشتراك غسيل المركبة {VehicleNumber} بتاريخ {ExpiryDate}. جدد الآن: {RenewalLink}'],
  ['renewal_received', 'en', 'We received your renewal request {RenewalId} for vehicle {VehicleNumber}. We will confirm once the payment is verified.'],
  ['renewal_received', 'ar', 'استلمنا طلب التجديد {RenewalId} للمركبة {VehicleNumber}. سنؤكد بعد التحقق من الدفع.'],
  ['payment_approved', 'en', 'Payment confirmed. Your subscription for vehicle {VehicleNumber} is active until {ExpiryDate}. Thank you!'],
  ['payment_approved', 'ar', 'تم تأكيد الدفع. اشتراك المركبة {VehicleNumber} فعال حتى {ExpiryDate}. شكراً لك!'],
  ['payment_rejected', 'en', 'Your payment receipt for {RenewalId} could not be verified: {Reason}. Please upload a new receipt: {RenewalLink}'],
  ['payment_rejected', 'ar', 'تعذر التحقق من إيصال الدفع {RenewalId}: {Reason}. يرجى رفع إيصال جديد: {RenewalLink}'],
  ['wash_completed', 'en', 'Your vehicle {VehicleNumber} was washed today. Remaining washes: {RemainingWashes}.'],
  ['wash_completed', 'ar', 'تم غسيل مركبتك {VehicleNumber} اليوم. الغسلات المتبقية: {RemainingWashes}.'],
  ['registration_approved', 'en', 'Welcome {OwnerName}! Your car wash subscription ({PlanName}) for {VehicleNumber} is active until {ExpiryDate}. Manage it here: {RenewalLink}'],
  ['registration_approved', 'ar', 'أهلاً {OwnerName}! تم تفعيل اشتراك غسيل السيارة ({PlanName}) للمركبة {VehicleNumber} حتى {ExpiryDate}. لمتابعة اشتراكك: {RenewalLink}'],
  ['otp', 'en', 'Your Car Wash verification code is {Code}. It expires in {Minutes} minutes.'],
  ['otp', 'ar', 'رمز التحقق الخاص بك هو {Code}. صالح لمدة {Minutes} دقائق.'],
];

// Idempotent upgrades for existing databases (new templates added in later phases)
export async function ensureTemplates() {
  const cos = await db.select({ id: schema.companies.id }).from(schema.companies);
  for (const c of cos) {
    for (const [key, lang, body] of SMS_TEMPLATES) {
      await db.insert(schema.smsTemplates).values({ companyId: c.id, key, lang, body }).onConflictDoNothing();
    }
  }
}

export async function seedIfEmpty() {
  const [{ count }] = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(schema.companies);
  if (count > 0) return false;
  console.log('Empty database – seeding base data' + (config.seedDemo ? ' + demo records' : ''));

  const [company] = await db.insert(schema.companies).values({ name: 'Sparkle Car Wash Co.', nameAr: 'شركة سباركل لغسيل السيارات', currency: 'EGP', timezone: 'Africa/Cairo', language: 'en' }).returning();
  const roleRows = {};
  for (const [name, def] of Object.entries(SYSTEM_ROLES)) {
    const [r] = await db.insert(schema.roles).values({ companyId: company.id, name, description: def.description, permissions: def.permissions, isSystem: true }).returning();
    roleRows[name] = r;
  }
  const [admin] = await db.insert(schema.users).values({ companyId: company.id, roleId: roleRows['Super Admin'].id, name: 'System Administrator', email: config.adminEmail.toLowerCase(), passwordHash: await bcrypt.hash(config.adminPassword, 10), userType: 'admin', dateJoined: today() }).returning();
  await db.insert(schema.smsTemplates).values(SMS_TEMPLATES.map(([key, lang, body]) => ({ companyId: company.id, key, lang, body })));
  await db.insert(schema.settings).values([
    { companyId: company.id, key: 'payment', value: { method: 'instapay', instapayAddress: '01000000000', instapayName: 'Sparkle Car Wash Co.', instructions: 'Transfer the exact amount via InstaPay to the number above, then upload a screenshot of the transfer.', instructionsAr: 'حوّل المبلغ بالضبط عبر إنستاباي على الرقم أعلاه ثم ارفع صورة التحويل.' } },
  ]);
  await db.insert(schema.auditLogs).values({ companyId: company.id, userId: admin.id, actorType: 'system', action: 'system.seed', entityType: 'company', entityId: company.id });

  if (config.seedDemo) await seedDemo(company, admin, roleRows);
  console.log(`Seed complete. Admin login: ${config.adminEmail} / ${config.adminPassword}`);
  return true;
}

async function seedDemo(company, admin, roleRows) {
  const req = { companyId: company.id, user: { id: admin.id }, ip: 'seed' };
  const cid = company.id;

  const compoundsData = [
    { name: 'Palm Hills October', code: 'PHO', address: '6th of October City, Giza', contactPerson: 'Eng. Karim Fathy', contactMobile: '+201001234567', unitsCount: 320 },
    { name: 'Mivida New Cairo', code: 'MVD', address: 'New Cairo, Cairo', contactPerson: 'Mrs. Dina Adel', contactMobile: '+201112345678', unitsCount: 540 },
    { name: 'Madinaty B7', code: 'MDB7', address: 'Madinaty, Cairo', contactPerson: 'Mr. Hossam Ali', contactMobile: '+201223456789', unitsCount: 210 },
  ];
  const compounds = [];
  for (const c of compoundsData) compounds.push((await db.insert(schema.compounds).values({ ...c, companyId: cid, isDemo: true }).returning())[0]);

  const staffNames = [['Ahmed Samir', [0, 1]], ['Mahmoud Hassan', [1]], ['Youssef Nabil', [2, 0]]];
  for (const [i, [name, cIdx]] of staffNames.entries()) {
    const [u] = await db.insert(schema.users).values({ companyId: cid, roleId: roleRows['Car Wash Staff'].id, name, email: `staff${i + 1}@carwash.local`, mobile: `+20100000000${i}`, passwordHash: await bcrypt.hash('Staff@12345', 10), pinHash: await bcrypt.hash('1234', 8), workDays: i === 1 ? [6, 0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6], userType: 'staff', employeeCode: `EMP-00${i + 1}`, dateJoined: addDays(today(), -200 + i * 30) }).returning();
    await db.insert(schema.staffCompounds).values(cIdx.map((k) => ({ userId: u.id, compoundId: compounds[k].id })));
  }
  await db.insert(schema.users).values({ companyId: cid, roleId: roleRows['Operations Manager'].id, name: 'Operations Manager', email: 'ops@carwash.local', passwordHash: await bcrypt.hash('Ops@12345', 10), userType: 'admin', dateJoined: today() });

  const plans = [];
  const plansData = [
    { name: 'Weekly Shine', nameAr: 'لمعة أسبوعية', planType: 'weekly', durationDays: 7, price: '150', allowedDays: [6, 0, 1, 2, 3, 4], maxFrequencyPerWeek: 2, maxWashes: 2, scope: 'per_vehicle' },
    { name: 'Monthly Standard', nameAr: 'شهري عادي', planType: 'monthly', durationDays: 30, price: '450', allowedDays: [6, 0, 1, 2, 3, 4], maxFrequencyPerWeek: 3, maxWashes: 12, scope: 'per_vehicle' },
    { name: 'Monthly Family (2 cars)', nameAr: 'شهري عائلي (سيارتين)', planType: 'monthly', durationDays: 30, price: '800', allowedDays: [6, 0, 1, 2, 3, 4], maxFrequencyPerWeek: 3, maxWashes: 24, scope: 'multi_vehicle', maxVehicles: 2 },
    { name: 'Quarterly Plus', nameAr: 'ربع سنوي بلس', planType: 'quarterly', durationDays: 90, price: '1200', allowedDays: [6, 0, 1, 2, 3, 4], maxFrequencyPerWeek: 3, maxWashes: 36, scope: 'per_vehicle' },
    { name: 'Annual Premium', nameAr: 'سنوي بريميوم', planType: 'annual', durationDays: 365, price: '4200', allowedDays: [6, 0, 1, 2, 3, 4], maxFrequencyPerWeek: 3, maxWashes: 150, scope: 'per_vehicle' },
  ];
  for (const p of plansData) plans.push((await db.insert(schema.subscriptionPlans).values({ ...p, companyId: cid }).returning())[0]);
  await db.insert(schema.planPrices).values([
    { planId: plans[1].id, compoundId: compounds[1].id, price: '500' },
    { planId: plans[1].id, vehicleType: 'suv', price: '520' },
    { planId: plans[3].id, compoundId: compounds[0].id, price: '1100' },
  ]);

  const firstNames = ['Mohamed', 'Omar', 'Sara', 'Nour', 'Hany', 'Mona', 'Tarek', 'Laila', 'Khaled', 'Yasmin', 'Amr', 'Rana', 'Sherif', 'Heba', 'Mostafa', 'Dalia'];
  const lastNames = ['Ibrahim', 'Salem', 'Farouk', 'Mansour', 'Abdelaziz', 'Shawky', 'Gamal', 'Zaki'];
  const brands = [['Toyota', 'Corolla'], ['Hyundai', 'Tucson'], ['Kia', 'Sportage'], ['Nissan', 'Sunny'], ['BMW', 'X3'], ['Mercedes', 'C200'], ['Chevrolet', 'Optra'], ['MG', 'ZS'], ['Jeep', 'Compass'], ['Renault', 'Logan']];
  const colors = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Red'];
  const types = ['sedan', 'suv', 'sedan', 'hatchback', 'suv'];
  const rnd = (arr, i) => arr[i % arr.length];
  const plate = (i) => `${['ABC', 'JKL', 'MNP', 'SRT', 'DEF'][i % 5]} ${1000 + i * 37}`;

  const vehiclesByUnit = [];
  let vIdx = 0;
  for (let i = 0; i < 16; i++) {
    const compound = compounds[i % 3];
    const [owner] = await db.insert(schema.owners).values({ companyId: cid, name: `${rnd(firstNames, i)} ${rnd(lastNames, i * 3)}`, mobile: `+2010${String(10000000 + i * 7919).slice(0, 8)}`, email: i % 2 ? `${rnd(firstNames, i).toLowerCase()}${i}@example.com` : null, isDemo: true, portalToken: crypto.randomBytes(24).toString('base64url') }).returning();
    const [unit] = await db.insert(schema.units).values({ companyId: cid, compoundId: compound.id, ownerId: owner.id, unitNumber: `${['A', 'B', 'C'][i % 3]}-${101 + i * 3}`, isDemo: true }).returning();
    const nVeh = i % 4 === 0 ? 2 : 1;
    const vs = [];
    for (let k = 0; k < nVeh; k++) {
      const [brand, model] = rnd(brands, vIdx);
      const [v] = await db.insert(schema.vehicles).values({ companyId: cid, vehicleCode: await nextCode(cid, 'vehicle', 'VH'), plateNumber: plate(vIdx), compoundId: compound.id, unitId: unit.id, ownerId: owner.id, brand, model, color: rnd(colors, vIdx), vehicleType: rnd(types, vIdx), registrationDate: addDays(today(), -120 + vIdx), isDemo: true }).returning();
      await db.insert(schema.qrCodes).values({ vehicleId: v.id, token: crypto.randomBytes(24).toString('base64url') });
      vs.push(v); vIdx++;
    }
    vehiclesByUnit.push({ unit, owner, compound, vehicles: vs });
  }

  // Subscriptions across every status
  const scenarios = [
    (u) => ({ planId: plans[1].id, startDate: addDays(today(), -10), paymentStatus: 'paid' }),                 // active
    (u) => ({ planId: plans[3].id, startDate: addDays(today(), -40), paymentStatus: 'paid' }),                 // active
    (u) => ({ planId: plans[1].id, startDate: addDays(today(), -26), paymentStatus: 'paid' }),                 // expiring soon (4 days)
    (u) => ({ planId: plans[0].id, startDate: addDays(today(), -5), paymentStatus: 'paid' }),                  // expiring soon (2 days)
    (u) => ({ planId: plans[1].id, startDate: addDays(today(), -45), paymentStatus: 'paid' }),                 // expired
    (u) => ({ planId: plans[1].id, startDate: addDays(today(), -2), paymentStatus: 'pending', paymentMethod: 'bank_transfer' }), // pending payment
    (u) => ({ planId: plans[4].id, startDate: addDays(today(), -100), paymentStatus: 'paid', discount: 200 }),  // active annual w/ discount
    (u) => ({ planId: plans[1].id, startDate: addDays(today(), -70), paymentStatus: 'paid' }),                 // expired → renewed below
  ];
  const subs = [];
  for (const [i, entry] of vehiclesByUnit.entries()) {
    const sc = scenarios[i % scenarios.length](entry);
    const multi = entry.vehicles.length > 1;
    const { subscription } = await createSubscription(req, {
      unitId: entry.unit.id, vehicleIds: multi ? entry.vehicles.map((v) => v.id) : [entry.vehicles[0].id],
      planId: multi ? plans[2].id : sc.planId, startDate: sc.startDate, paymentStatus: sc.paymentStatus, paymentMethod: sc.paymentMethod || (i % 3 ? 'bank_transfer' : 'cash'), discount: sc.discount || 0, notes: 'Demo record',
    });
    subs.push({ subscription, entry, scenarioIndex: i % scenarios.length });
  }
  // Renewal history: expired → renewed active; and an expired one with a pending renewal
  for (const s of subs.filter((x) => x.scenarioIndex === 7)) await renewSubscription(req, s.subscription.id, { paymentStatus: 'paid', startDate: addDays(today(), -15) });
  const pendingRenew = subs.find((x) => x.scenarioIndex === 4);
  if (pendingRenew) await renewSubscription(req, pendingRenew.subscription.id, { paymentStatus: 'pending', startDate: today() });
  await db.update(schema.subscriptions).set({ isDemo: true }).where(eq(schema.subscriptions.companyId, cid));
  await db.update(schema.payments).set({ isDemo: true }).where(eq(schema.payments.companyId, cid));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedIfEmpty().then((did) => { console.log(did ? 'Seeded' : 'Database already has data – nothing to do'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}
