import { pool } from '../config/database.js';

export const up = async () => {
  console.log('🔄 Migration: Converting connections to bidirectional...');

  try {
    // Step 1: Create new connections table with bidirectional schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS connections_new (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_a_id, user_b_id)
      );
    `);
    console.log('✅ Created new connections_new table');

    // Step 2: Migrate existing data from old schema
    // For each directional connection, normalize to (user_a_id, user_b_id) where user_a_id < user_b_id
    await pool.query(`
      INSERT INTO connections_new (id, user_a_id, user_b_id, initiator_id, status, created_at, updated_at)
      SELECT
        id,
        CASE WHEN sender_id < receiver_id THEN sender_id ELSE receiver_id END as user_a_id,
        CASE WHEN sender_id < receiver_id THEN receiver_id ELSE sender_id END as user_b_id,
        sender_id as initiator_id,
        status,
        created_at,
        updated_at
      FROM connections
      ON CONFLICT (user_a_id, user_b_id) DO NOTHING;
    `);
    console.log('✅ Migrated existing connections data');

    // Step 3: Drop old table and rename new one
    await pool.query('DROP TABLE connections;');
    await pool.query('ALTER TABLE connections_new RENAME TO connections;');
    console.log('✅ Replaced old connections table');

    console.log('🎉 Migration complete: bidirectional connections ready!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
};

export const down = async () => {
  console.log('⏮️ Rollback: Reverting to unidirectional connections...');

  try {
    // Create old schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS connections_old (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(sender_id, receiver_id)
      );
    `);

    // Migrate back
    await pool.query(`
      INSERT INTO connections_old (id, sender_id, receiver_id, status, created_at, updated_at)
      SELECT id, initiator_id, CASE WHEN initiator_id = user_a_id THEN user_b_id ELSE user_a_id END, status, created_at, updated_at
      FROM connections
      ON CONFLICT (sender_id, receiver_id) DO NOTHING;
    `);

    await pool.query('DROP TABLE connections;');
    await pool.query('ALTER TABLE connections_old RENAME TO connections;');
    console.log('✅ Rollback complete');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
};
