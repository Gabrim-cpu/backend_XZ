import { addPoints, getDailyPoints, getTotalPoints, awardBadge, getUserBadges, getLeaderboard } from '../models/PointTransaction.js';
import { createNotification } from './notificationService.js';

const formatBadgeLabel = (badge) =>
  badge.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const RULES = {
  story_uploaded: { points: 25, dailyLimit: 100, badge: 'story_keeper', badgeThreshold: 100 },
  mentorship_session: { points: 50, dailyLimit: 100, badge: 'mentor', badgeThreshold: 200 },
  commented: { points: 5, dailyLimit: 25, badge: 'active_listener', badgeThreshold: 50 },
  PUBLISH_STORY: { points: 10, dailyLimit: 100 },
  VIEW_STORY: { points: 2, dailyLimit: 40 },
  COMMENT: { points: 3, dailyLimit: 30 },
  REPLY: { points: 3, dailyLimit: 30 },
  CONNECTION_ACCEPTED: { points: 20, dailyLimit: 100 },
  FIRST_CONVERSATION: { points: 20, dailyLimit: 60 },
  VOICE_INTERACTION: { points: 30, dailyLimit: 90 },
  KNOWLEDGE_SESSION_COMPLETED: { points: 50, dailyLimit: 150 },
};

export const handleAction = async (userId, action) => {
  const rule = RULES[action];
  if (!rule) {
    throw new Error(`Invalid action: ${action}`);
  }

  // Check daily limit
  const dailyPoints = await getDailyPoints(userId, action);
  if (dailyPoints + rule.points > rule.dailyLimit) {
    return { success: false, message: `Daily limit reached for action: ${action}` };
  }

  // Add points
  const transaction = await addPoints(userId, action, rule.points);

  // Check and award badges
  const totalPoints = await getTotalPoints(userId);
  let newBadge = null;
  if (rule.badge && totalPoints >= rule.badgeThreshold) {
    const badge = await awardBadge(userId, rule.badge);
    if (badge) {
      newBadge = rule.badge;
      // Bell-only notification (not "important", so it won't pop a toast).
      createNotification({
        recipientUserId: userId,
        type: 'badge',
        title: 'New badge earned!',
        body: `You earned the ${formatBadgeLabel(rule.badge)} badge`,
        data: { badge: rule.badge },
        important: false,
      });
    }
  }

  return {
    success: true,
    transaction,
    newBadge,
    totalPoints
  };
};

export const getUserSummary = async (userId) => {
  const totalPoints = await getTotalPoints(userId);
  const badges = await getUserBadges(userId);
  return { totalPoints, badges };
};

export const getLeaderboardData = async () => {
  return await getLeaderboard();
};
