import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { config } from '../lib/config.js';

// Managed Postgres providers (Neon, Render, Supabase…) require TLS; `sslmode=require` in the URL turns it on.
const ssl = /sslmode=(require|verify-ca|verify-full)/.test(config.databaseUrl) || process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: Number(process.env.DB_POOL_MAX || 10), ssl, options: `-c timezone=${config.timezone}` });
export const db = drizzle(pool, { schema });
export { schema };
