import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const required = (key, fallback) => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required environment variable ${key}`);
  return v;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/carwash'),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  uploadsDir: process.env.UPLOADS_DIR || path.resolve(__dirname, '../../uploads'),
  publicDir: path.resolve(__dirname, '../../public'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  seedDemo: (process.env.SEED_DEMO || 'true') === 'true',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@carwash.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@12345',
  expiringSoonDays: Number(process.env.EXPIRING_SOON_DAYS || 7),
  // Business timezone: drives "today" on the server and CURRENT_DATE in Postgres sessions
  timezone: process.env.TZ || 'Africa/Cairo',
};
