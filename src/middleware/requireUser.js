import { pool } from '../config/database.js';

export const requireUser = async (req, res, next) => {
  if (!req.firebaseUser || !req.firebaseUser.uid) {
    console.error('❌ requireUser: No Firebase user in request');
    return res.status(401).json({ error: 'Unauthorized: No firebase user' });
  }

  console.log('👤 requireUser: Looking up Firebase UID:', req.firebaseUser.uid);

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [req.firebaseUser.uid]
    );

    if (result.rows.length === 0) {
      console.error('❌ requireUser: User NOT found in database for UID:', req.firebaseUser.uid);
      return res.status(404).json({ error: 'User not found in database' });
    }

    console.log('✅ requireUser: User found:', result.rows[0].email);
    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('❌ requireUser middleware error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
