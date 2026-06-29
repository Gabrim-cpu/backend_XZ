import { pool } from '../config/database.js';

export const normalizeInterests = (interests) => {
  if (!interests) return [];
  const list = Array.isArray(interests) ? interests : [interests];
  return list
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

export const findLearningOverlap = (learnerInterests, teacherInterests) => {
  const teachSet = new Set(normalizeInterests(teacherInterests));
  return normalizeInterests(learnerInterests).filter((interest) => teachSet.has(interest));
};

export const calculateCompatibilityScore = (userA, userB) => {
  const aLearn = normalizeInterests(userA.learn_interests);
  const aShare = normalizeInterests(userA.share_interests);
  const bLearn = normalizeInterests(userB.learn_interests);
  const bShare = normalizeInterests(userB.share_interests);

  const youCanLearn = findLearningOverlap(aLearn, bShare);
  const theyCanLearn = findLearningOverlap(bLearn, aShare);

  const hasMatch = youCanLearn.length > 0 || theyCanLearn.length > 0;
  if (!hasMatch) {
    return { score: 0, youCanLearn, theyCanLearn, reciprocal: false };
  }

  const yourLearnMatchRate = aLearn.length
    ? youCanLearn.length / aLearn.length
    : youCanLearn.length > 0 ? 1 : 0;
  const theirLearnMatchRate = bLearn.length
    ? theyCanLearn.length / bLearn.length
    : theyCanLearn.length > 0 ? 1 : 0;

  let score = Math.round(((yourLearnMatchRate + theirLearnMatchRate) / 2) * 100);

  if (youCanLearn.length > 0 && theyCanLearn.length > 0) {
    score = Math.min(100, score + 5);
  }

  return {
    score,
    youCanLearn,
    theyCanLearn,
    reciprocal: youCanLearn.length > 0 && theyCanLearn.length > 0,
  };
};

export const formatInterestLabel = (interest) =>
  interest.charAt(0).toUpperCase() + interest.slice(1);

export const getRecommendations = async (userId) => {
  const userResult = await pool.query(
    'SELECT id, identity, learn_interests, share_interests FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const currentUser = userResult.rows[0];

  if (!currentUser.identity) {
    return [];
  }

  const targetIdentity = currentUser.identity === 'Senior' ? 'Youth' : 'Senior';

  const candidatesResult = await pool.query(
    `SELECT id, display_name, avatar_url, identity, learn_interests, share_interests, age
     FROM users
     WHERE id != $1
       AND identity = $2
       AND is_active = TRUE
       AND id NOT IN (
         SELECT user_a_id FROM connections WHERE user_b_id = $1 AND status != 'rejected'
         UNION
         SELECT user_b_id FROM connections WHERE user_a_id = $1 AND status != 'rejected'
       )`,
    [userId, targetIdentity]
  );

  const scoredCandidates = candidatesResult.rows
    .map((candidate) => {
      const { score, youCanLearn, theyCanLearn, reciprocal } = calculateCompatibilityScore(
        currentUser,
        candidate
      );

      return {
        id: candidate.id,
        display_name: candidate.display_name,
        avatar_url: candidate.avatar_url,
        identity: candidate.identity,
        learn_interests: candidate.learn_interests || [],
        share_interests: candidate.share_interests || [],
        age: candidate.age,
        compatibility_score: score,
        reciprocal,
        you_can_learn: youCanLearn.map(formatInterestLabel),
        they_can_learn: theyCanLearn.map(formatInterestLabel),
      };
    });

  const matchedCandidates = scoredCandidates
    .filter((item) => item.compatibility_score > 0)
    .sort((a, b) => {
      if (b.compatibility_score !== a.compatibility_score) {
        return b.compatibility_score - a.compatibility_score;
      }
      if (b.reciprocal !== a.reciprocal) {
        return Number(b.reciprocal) - Number(a.reciprocal);
      }
      return (a.display_name || '').localeCompare(b.display_name || '');
    });

  const resultsToReturn = matchedCandidates.length > 0
    ? matchedCandidates
    : scoredCandidates.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));

  return resultsToReturn.slice(0, 10);
};
