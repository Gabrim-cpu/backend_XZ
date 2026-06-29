import { pool } from '../config/database.js';

export const calculateRootStrength = async (userAId, userBId) => {
  try {
    // Determine number of interactions between the two users
    const result = await pool.query(`
      SELECT interaction_type, COUNT(*) as count
      FROM interactions
      WHERE (user_a_id = $1 AND user_b_id = $2)
         OR (user_a_id = $2 AND user_b_id = $1)
      GROUP BY interaction_type
    `, [userAId, userBId]);

    let messages = 0;
    let voiceSessions = 0;
    let storiesViewed = 0;

    result.rows.forEach(row => {
      if (row.interaction_type === 'MESSAGE') messages = parseInt(row.count);
      if (row.interaction_type === 'VOICE_SESSION') voiceSessions = parseInt(row.count);
      if (row.interaction_type === 'STORY_VIEW') storiesViewed = parseInt(row.count);
    });

    // Simple heuristic for Root Strength out of 100
    let strength = (messages * 1) + (voiceSessions * 5) + (storiesViewed * 2);
    if (strength > 100) strength = 100;

    return strength;
  } catch (error) {
    console.error('Error calculating Root Strength:', error);
    return 0;
  }
};

export const recordInteraction = async (userAId, userBId, type) => {
  try {
    await pool.query(`
      INSERT INTO interactions (user_a_id, user_b_id, interaction_type)
      VALUES ($1, $2, $3)
    `, [userAId, userBId, type]);
  } catch (error) {
    console.error('Error recording interaction:', error);
  }
};
