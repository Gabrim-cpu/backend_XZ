import { pool } from '../config/database.js';

export const initPointDB = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS point_transactions (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      action VARCHAR(100) NOT NULL,
      points INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      user_id VARCHAR(255) NOT NULL,
      badge_id VARCHAR(100) NOT NULL,
      awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, badge_id)
    );
  `;
  try {
    await pool.query(query);
    console.log('✅ Point DB tables initialized');
  } catch (error) {
    console.error('❌ Point DB init error:', error);
  }
};

export const addPoints = async (userId, action, points) => {
  const query = `
    INSERT INTO point_transactions (user_id, action, points)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const result = await pool.query(query, [userId, action, points]);
  return result.rows[0];
};

export const getDailyPoints = async (userId, action) => {
  const query = `
    SELECT COALESCE(SUM(points), 0) as total
    FROM point_transactions
    WHERE user_id = $1 AND action = $2
    AND created_at >= CURRENT_DATE;
  `;
  const result = await pool.query(query, [userId, action]);
  return parseInt(result.rows[0].total);
};

export const getTotalPoints = async (userId) => {
  const query = `
    SELECT COALESCE(SUM(points), 0) as total
    FROM point_transactions
    WHERE user_id = $1;
  `;
  const result = await pool.query(query, [userId]);
  return parseInt(result.rows[0].total);
};

export const awardBadge = async (userId, badgeId) => {
  const query = `
    INSERT INTO user_badges (user_id, badge_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
    RETURNING *;
  `;
  const result = await pool.query(query, [userId, badgeId]);
  return result.rows[0];
};

export const getUserBadges = async (userId) => {
  const query = `
    SELECT badge_id, awarded_at
    FROM user_badges
    WHERE user_id = $1;
  `;
  const result = await pool.query(query, [userId]);
  return result.rows;
};

export const getLeaderboard = async () => {
  const query = `
    SELECT user_id, SUM(points) as total_points
    FROM point_transactions
    GROUP BY user_id
    ORDER BY total_points DESC
    LIMIT 10;
  `;
  const result = await pool.query(query);
  return result.rows;
};
