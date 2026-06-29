import { pool } from '../config/database.js';
import { runMigrations } from './migration.js';

const setupDatabase = async () => {
  console.log('🔧 Setting up database tables...');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid VARCHAR(128) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255),
        identity VARCHAR(10) CHECK (identity IN ('Senior', 'Youth')),
        language VARCHAR(10) DEFAULT 'en',
        avatar_url TEXT,
        bio TEXT,
        location VARCHAR(255),
        age INTEGER,
        learn_interests TEXT[],
        share_interests TEXT[],
        root_points INTEGER DEFAULT 0,
        total_sessions_attended INTEGER DEFAULT 0,
        total_stories_shared INTEGER DEFAULT 0,
        total_teachings_given INTEGER DEFAULT 0,
        is_onboarded BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        last_seen_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        deleted_at TIMESTAMP WITH TIME ZONE
      );
    `);

    console.log('✅ Users table ready');

    // Ensure new columns exist if the table was already created
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS age INTEGER,
      ADD COLUMN IF NOT EXISTS learn_interests TEXT[],
      ADD COLUMN IF NOT EXISTS share_interests TEXT[];
    `);

    // Create connections table with bidirectional schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS connections (
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
    console.log('✅ Connections table ready (bidirectional schema)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id UUID REFERENCES users(id) ON DELETE CASCADE,
        author_name VARCHAR(255),
        type VARCHAR(20) DEFAULT 'post',
        body TEXT,
        media_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Posts table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_a_id UUID REFERENCES users(id) ON DELETE CASCADE,
        user_b_id UUID REFERENCES users(id) ON DELETE CASCADE,
        interaction_type VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Interactions table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        font_size VARCHAR(20) DEFAULT 'medium',
        high_contrast BOOLEAN DEFAULT FALSE,
        email_notifications BOOLEAN DEFAULT TRUE,
        push_notifications BOOLEAN DEFAULT TRUE,
        profile_visibility VARCHAR(20) DEFAULT 'public',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'text',
        voice_url TEXT,
        transcription TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log('✅ User preferences and messages tables ready');
    console.log('🎉 Database setup complete!');

    
  } catch (error) {
    console.error('❌ Database setup error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

setupDatabase();