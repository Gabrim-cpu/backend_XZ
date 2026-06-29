import pkg from 'pg';
const { Client } = pkg;

const configs = [
  { user: 'postgres', password: 'xz_password_123', database: 'xz_database' },
  { user: 'postgres', password: 'xz_password_123', database: 'postgres' },
  { user: 'xz_user', password: 'xz_password_123', database: 'xz_database' },
  { user: 'postgres', password: '', database: 'postgres' },
];

async function run() {
  for (const config of configs) {
    const client = new Client({
      host: 'localhost',
      port: 5432,
      ...config
    });
    try {
      await client.connect();
      console.log(`SUCCESS: user=${config.user} password=${config.password} database=${config.database}`);
      await client.end();
    } catch (e) {
      console.log(`FAILED: user=${config.user} password=${config.password} database=${config.database} - error: ${e.message}`);
    }
  }
}

run();
