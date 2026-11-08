import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => { console.log('Migrations applied'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
