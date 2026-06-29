import { pool } from '../config/database.js';
import { handleAction } from '../services/pointService.js';
import { getRecommendations } from '../services/recommendationService.js';
import { createNotification } from '../services/notificationService.js';

const normalizeUserPair = (userId1, userId2) => {
  return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
};

export const sendRequest = async (req, res) => {
  const { receiverId } = req.body;
  const senderId = req.user.id;

  if (senderId === receiverId) {
    return res.status(400).json({ error: 'Cannot connect with yourself' });
  }

  try {
    const [userA, userB] = normalizeUserPair(senderId, receiverId);

    // Check if connection already exists (any status)
    const existingResult = await pool.query(
      `SELECT * FROM connections WHERE user_a_id = $1 AND user_b_id = $2`,
      [userA, userB]
    );

    if (existingResult.rows.length > 0) {
      const conn = existingResult.rows[0];
      if (conn.status === 'pending') {
        return res.status(409).json({ error: 'Connection request already pending' });
      }
      if (conn.status === 'accepted') {
        return res.status(409).json({ error: 'Already connected' });
      }
      if (conn.status === 'rejected') {
        // Re-open a previously rejected connection as a fresh pending request
        // from the current sender (rejection is not permanent).
        const reopened = await pool.query(
          `UPDATE connections
           SET status = 'pending', initiator_id = $3, updated_at = NOW()
           WHERE user_a_id = $1 AND user_b_id = $2
           RETURNING *`,
          [userA, userB, senderId]
        );
        createNotification({
          recipientUserId: receiverId,
          type: 'connection_request',
          title: 'New connection request',
          body: `${req.user.display_name || 'Someone'} wants to connect with you`,
          data: { senderId, connectionId: reopened.rows[0].id },
          important: true,
        });
        return res.json({ success: true, connection: reopened.rows[0] });
      }
    }

    // ON CONFLICT guards the race where two requests for the same pair arrive
    // together (both pass the existence check, then both INSERT).
    const result = await pool.query(
      `INSERT INTO connections (user_a_id, user_b_id, initiator_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (user_a_id, user_b_id) DO NOTHING
       RETURNING *`,
      [userA, userB, senderId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Connection request already pending' });
    }

    createNotification({
      recipientUserId: receiverId,
      type: 'connection_request',
      title: 'New connection request',
      body: `${req.user.display_name || 'Someone'} wants to connect with you`,
      data: { senderId, connectionId: result.rows[0].id },
      important: true,
    });

    res.json({ success: true, connection: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const acceptRequest = async (req, res) => {
  const { connectionId } = req.body;
  const userId = req.user.id;

  try {
    // Find the connection and verify user is either party
    const connResult = await pool.query(
      `SELECT * FROM connections WHERE id = $1 AND (user_a_id = $2 OR user_b_id = $2) AND status = 'pending'`,
      [connectionId, userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection request not found or not pending' });
    }

    const connection = connResult.rows[0];
    const otherUserId = connection.user_a_id === userId ? connection.user_b_id : connection.user_a_id;

    // Update connection status
    const result = await pool.query(
      `UPDATE connections
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [connectionId]
    );

    // Award points to both users
    await handleAction(userId, 'CONNECTION_ACCEPTED');
    await handleAction(otherUserId, 'CONNECTION_ACCEPTED');

    createNotification({
      recipientUserId: otherUserId,
      type: 'connection_accepted',
      title: 'Connection accepted',
      body: `${req.user.display_name || 'Someone'} accepted your connection request`,
      data: { connectionId, userId },
      important: true,
    });

    res.json({ success: true, connection: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const rejectRequest = async (req, res) => {
  const { connectionId } = req.body;
  const userId = req.user.id;

  try {
    // Find connection where user is either party and status is pending
    const result = await pool.query(
      `UPDATE connections
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1 AND (user_a_id = $2 OR user_b_id = $2) AND status = 'pending'
       RETURNING *`,
      [connectionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection request not found' });
    }

    res.json({ success: true, connection: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMatches = async (req, res) => {
  try {
    const recommendations = await getRecommendations(req.user.id);
    res.json({ matches: recommendations, recommendations });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

export const getRecommendationsHandler = getMatches;


export const getPendingRequests = async (req, res) => {
  const userId = req.user.id;
  try {
    // Get pending requests where current user is NOT the initiator
    const result = await pool.query(`
      SELECT c.id as connection_id,
             CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END as sender_id,
             u.display_name, u.avatar_url, u.identity
      FROM connections c
      JOIN users u ON (CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END) = u.id
      WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
      AND c.status = 'pending'
      AND c.initiator_id != $1
    `, [userId]);

    res.json({ requests: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSentRequests = async (req, res) => {
  const userId = req.user.id;
  try {
    // Get pending requests initiated by current user
    const result = await pool.query(`
      SELECT c.id as connection_id,
             CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END as receiver_id,
             u.display_name, u.avatar_url, u.identity
      FROM connections c
      JOIN users u ON (CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END) = u.id
      WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
      AND c.status = 'pending'
      AND c.initiator_id = $1
    `, [userId]);

    res.json({ requests: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAcceptedConnections = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT c.id as connection_id,
             CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END as connected_user_id,
             u.display_name, u.avatar_url, u.identity,
             c.created_at, c.updated_at
      FROM connections c
      JOIN users u ON (CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END) = u.id
      WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
      AND c.status = 'accepted'
      ORDER BY c.updated_at DESC
    `, [userId]);

    res.json({ connections: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  const userId = req.user.id;
  const { identity } = req.query;
  try {
    // Exclude users we already have a pending/accepted connection with so the
    // Discover list can't offer a "Connect" that would 409. Rejected pairs are
    // allowed back (re-requesting re-opens them — see sendRequest).
    let query = `
      SELECT id, display_name, avatar_url, identity, age, learn_interests, share_interests, bio
      FROM users
      WHERE id != $1
      AND is_active = TRUE
      AND id NOT IN (
        SELECT user_a_id FROM connections WHERE user_b_id = $1 AND status != 'rejected'
        UNION
        SELECT user_b_id FROM connections WHERE user_a_id = $1 AND status != 'rejected'
      )
    `;
    const params = [userId];

    if (identity && (identity === 'Senior' || identity === 'Youth')) {
      query += ` AND identity = $${params.length + 1}`;
      params.push(identity);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ users: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
