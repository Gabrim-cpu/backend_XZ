import { handleAction, getUserSummary, getLeaderboardData } from '../services/pointService.js';

export const awardPoints = async (req, res) => {
  try {
    const { userId, action } = req.body;
    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing userId or action' });
    }

    const result = await handleAction(userId, action);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error awarding points:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSummary = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const summary = await getUserSummary(userId);
    res.status(200).json(summary);
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLeaderboard = async (req, res) => {
  try {
    const data = await getLeaderboardData();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
