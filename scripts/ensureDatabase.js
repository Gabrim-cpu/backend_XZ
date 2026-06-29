import { execSync } from 'child_process';
import pkg from 'pg';
import dotenv from 'dotenv';
import { runDockerCompose, requireDocker } from './dockerUtils.js';

dotenv.config();

const { Pool } = pkg;

const createPool = () =>
  new Pool({
    user: process.env.DB_USER || 'xz_user',
    password: process.env.DB_PASSWORD || 'xz_password_123',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'xz_database',
  });

const isAuthError = (message = '') =>
  message.includes('password authentication failed') ||
  message.includes('28P01');

async function tryConnect(pool) {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch (error) {
    return error;
  }
}

async function resetDockerVolume() {
  console.log('🔄 Resetting Docker PostgreSQL volume (credentials out of sync)...');
  runDockerCompose('down -v');
  runDockerCompose('up -d');
  execSync('node scripts/waitForPostgres.js', { stdio: 'inherit', cwd: process.cwd(), timeout: 120000 });
}

async function ensureDatabase() {
  requireDocker();
  let pool = createPool();
  let result = await tryConnect(pool);
  await pool.end();

  if (result === true) {
    console.log('✅ PostgreSQL credentials verified');
    return;
  }

  if (isAuthError(result.message)) {
    await resetDockerVolume();

    pool = createPool();
    result = await tryConnect(pool);
    await pool.end();

    if (result !== true) {
      console.error('❌ PostgreSQL still unavailable after volume reset:', result.message);
      process.exit(1);
    }

    console.log('✅ PostgreSQL recovered after volume reset');
    return;
  }

  console.error('❌ PostgreSQL error:', result.message);
  console.error('   Start Docker Desktop, then run: npm run db:setup');
  process.exit(1);
}

ensureDatabase();
