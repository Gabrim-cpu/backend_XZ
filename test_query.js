import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://xz_user:xz_password_123@localhost:5433/xz_database'
});

async function run() {
  try {
    const userId = 'ebf05ae1-6f81-4e45-8d9c-06bcd4427141'; // Senior (djodjoungcybile)
    const userResult = await pool.query('SELECT id, learn_interests, share_interests, identity FROM users WHERE id = $1', [userId]);
    const { learn_interests, share_interests, identity } = userResult.rows[0];
    const targetIdentity = identity === 'Senior' ? 'Youth' : 'Senior';

    console.log('User identity:', identity);
    console.log('User learn:', learn_interests);
    console.log('User share:', share_interests);
    console.log('Target identity:', targetIdentity);

    const q = `
      SELECT id, display_name, avatar_url, identity, learn_interests, share_interests,
             (CASE WHEN (share_interests && $3::text[] OR learn_interests && $4::text[]) THEN 1 ELSE 0 END) as overlap_score
      FROM users
      WHERE id != $1
      AND identity = $2
      AND id NOT IN (
        SELECT receiver_id FROM connections WHERE sender_id = $1
        UNION
        SELECT sender_id FROM connections WHERE receiver_id = $1
      )
      ORDER BY overlap_score DESC, created_at DESC
      LIMIT 10
    `;

    const res = await pool.query(q, [userId, targetIdentity, learn_interests || [], share_interests || []]);
    console.log('Query results:', res.rows);
  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    await pool.end();
  }
}

run();
