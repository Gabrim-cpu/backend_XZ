import { pool } from '../config/database.js';
import { handleAction } from '../services/pointService.js';

export const getFeed = async (req, res) => {
  const userId = req.user.id;
  const identity = req.user.identity;

  try {
    // 1. Get all connections (accepted) to prioritize their posts
    const connectionsResult = await pool.query(`
      SELECT user_a_id, user_b_id
      FROM connections
      WHERE (user_a_id = $1 OR user_b_id = $1) AND status = 'accepted'
    `, [userId]);

    const connectedUserIds = connectionsResult.rows.map(row =>
      row.user_a_id === userId ? row.user_b_id : row.user_a_id
    );

    // 2. Build the feed query
    // Basic idea: Give a score to posts to rank them.
    // Connected users: +50 score
    // Identity-based priority:
    // If Youth, Senior posts get +20
    // If Senior, Youth posts get +20 (especially tech tutorials, but we don't have tags yet, so we just boost youth posts)
    
    // We will just do a simple query prioritizing connected users and the opposite identity.
    const oppositeIdentity = identity === 'Senior' ? 'Youth' : 'Senior';

    // Note: userId is intentionally NOT a bound parameter here — Postgres rejects
    // a passed parameter that's never referenced ("could not determine data type
    // of parameter $1"). Only the two params actually used are bound.
    const postsResult = await pool.query(`
      SELECT p.*, u.identity, u.avatar_url,
        CASE
          WHEN p.author_id = ANY($1::uuid[]) THEN 100
          WHEN u.identity = $2 THEN 50
          ELSE 0
        END as relevance_score
      FROM posts p
      JOIN users u ON p.author_id = u.id
      ORDER BY relevance_score DESC, p.created_at DESC
      LIMIT 50
    `, [connectedUserIds, oppositeIdentity]);

    res.json({ feed: postsResult.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPost = async (req, res) => {
  const { body, media_url, type } = req.body;
  const userId = req.user.id;
  const displayName = req.user.display_name;

  if (!body) {
    return res.status(400).json({ error: 'Post body is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts (author_id, author_name, type, body, media_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, displayName, type || 'post', body, media_url || null]
    );

    // Award Root Points: Publish Story: +10
    await handleAction(userId, 'PUBLISH_STORY');

    res.status(201).json({ success: true, post: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
