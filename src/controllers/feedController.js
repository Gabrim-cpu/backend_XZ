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

    const postsResult = await pool.query(`
      SELECT p.*, u.identity, u.avatar_url,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
        EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = $3::uuid) AS liked_by_me,
        CASE
          WHEN p.author_id = ANY($1::uuid[]) THEN 100
          WHEN u.identity = $2 THEN 50
          ELSE 0
        END as relevance_score
      FROM posts p
      JOIN users u ON p.author_id = u.id
      ORDER BY relevance_score DESC, p.created_at DESC
      LIMIT 50
    `, [connectedUserIds, oppositeIdentity, userId]);

    res.json({ feed: postsResult.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPost = async (req, res) => {
  const { body, media_url, type, category } = req.body;
  const userId = req.user.id;
  const displayName = req.user.display_name;

  if (!body) {
    return res.status(400).json({ error: 'Post body is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts (author_id, author_name, type, body, media_url, category)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, displayName, type || 'post', body, media_url || null, category || null]
    );

    // Award Root Points: Publish Story: +10
    await handleAction(userId, 'PUBLISH_STORY');

    res.status(201).json({ success: true, post: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Toggle a like on a post: unlike if already liked, like otherwise.
export const toggleLike = async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;

  try {
    const removed = await pool.query(
      'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );

    let liked = false;
    if (removed.rowCount === 0) {
      await pool.query(
        'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [postId, userId]
      );
      liked = true;
    }

    const count = await pool.query(
      'SELECT COUNT(*)::int AS c FROM post_likes WHERE post_id = $1',
      [postId]
    );

    res.json({ success: true, liked, like_count: count.rows[0].c });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
