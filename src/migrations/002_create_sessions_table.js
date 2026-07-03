import { pool } from '../config/database.js';

export const up = async () => {
  console.log('📅 Migration: Creating sessions table...');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic VARCHAR(255) NOT NULL,
        description TEXT,
        scheduled_date DATE NOT NULL,
        scheduled_time TIME NOT NULL,
        duration_minutes INT DEFAULT 60 CHECK (duration_minutes > 0),
        meeting_link VARCHAR(500),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')),
        organizer_notes TEXT,
        participant_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT valid_date_time CHECK (scheduled_date >= CURRENT_DATE)
      );

      CREATE INDEX idx_sessions_organizer ON sessions(organizer_id);
      CREATE INDEX idx_sessions_participant ON sessions(participant_id);
      CREATE INDEX idx_sessions_status ON sessions(status);
      CREATE INDEX idx_sessions_scheduled ON sessions(scheduled_date, scheduled_time);
    `);
    console.log('✅ Created sessions table with indexes');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
};

export const down = async () => {
  console.log('⏮️ Rollback: Dropping sessions table...');

  try {
    await pool.query('DROP TABLE IF EXISTS sessions;');
    console.log('✅ Dropped sessions table');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
};
