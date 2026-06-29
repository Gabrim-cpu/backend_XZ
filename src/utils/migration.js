import { pool } from '../config/database.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

export const runMigrations = async () => {
  console.log('🔧 Running migrations...');

  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Get list of migration files
    const files = await fs.readdir(MIGRATIONS_DIR);
    const migrationFiles = files
      .filter(f => f.endsWith('.js') && !f.startsWith('.'))
      .sort();

    // Check which migrations have been executed
    const executedResult = await pool.query('SELECT name FROM schema_migrations;');
    const executed = new Set(executedResult.rows.map(r => r.name));

    // Run pending migrations
    for (const file of migrationFiles) {
      if (!executed.has(file)) {
        console.log(`▶️  Running migration: ${file}`);
        const { up } = await import(`../migrations/${file}`);
        await up();

        // Record migration
        await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        console.log(`✅ Migration ${file} completed`);
      }
    }

    console.log('🎉 All migrations completed!');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  }
};

export const rollbackMigration = async (steps = 1) => {
  console.log(`⏮️  Rolling back ${steps} migration(s)...`);

  try {
    const executedResult = await pool.query(
      'SELECT name FROM schema_migrations ORDER BY executed_at DESC LIMIT $1',
      [steps]
    );

    const toRollback = executedResult.rows.map(r => r.name).reverse();

    for (const file of toRollback) {
      console.log(`⏮️  Rolling back: ${file}`);
      const { down } = await import(`../migrations/${file}`);
      await down();

      await pool.query('DELETE FROM schema_migrations WHERE name = $1', [file]);
      console.log(`✅ Rollback ${file} completed`);
    }

    console.log('🎉 Rollback completed!');
  } catch (error) {
    console.error('❌ Rollback error:', error.message);
    throw error;
  }
};
