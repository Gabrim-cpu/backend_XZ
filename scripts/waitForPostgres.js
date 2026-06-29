import { pool, testConnection } from '../src/config/database.js';
import { requireDocker } from './dockerUtils.js';

const MAX_ATTEMPTS = 30;
const DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPostgres() {
  requireDocker();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const ok = await testConnection();
    if (ok) {
      await pool.end();
      process.exit(0);
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(`   Waiting for PostgreSQL (${attempt}/${MAX_ATTEMPTS})...`);
      await sleep(DELAY_MS);
    }
  }

  console.error('❌ PostgreSQL did not become ready in time.');
  await pool.end();
  process.exit(1);
}

waitForPostgres();
