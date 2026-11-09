import { createApp } from './app.js';
import { config } from './lib/config.js';
import { runMigrations } from './db/migrate.js';
import { seedIfEmpty, ensureTemplates } from './db/seed.js';
import { startSchedulers, runDailyAutomation } from './services/automation.js';
import { checkStorage } from './lib/storage.js';

async function main() {
  await runMigrations();
  console.log('File storage:', await checkStorage());
  await seedIfEmpty();
  await ensureTemplates();
  await runDailyAutomation().catch((e) => console.error('initial status refresh failed', e));
  startSchedulers();
  const app = createApp();
  app.listen(config.port, () => console.log(`Car Wash API listening on :${config.port} (${config.env})`));
}

main().catch((e) => { console.error(e); process.exit(1); });
