import { pool } from '../config/database.js';

export const requireUser = async (req, res, next) => {
  if (!req.firebaseUser || !req.firebaseUser.uid) {
    return res.status(401).json({ error: 'Unauthorized: No firebase user' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [req.firebaseUser.uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('requireUser middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
