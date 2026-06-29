/**
 * Matching Service - Finds compatible mentorship pairs
 * Uses multi-factor scoring: interest match, skill exchange, availability, location
 */

const db = require('../config/firestore.js');

/**
 * Calculate compatibility score between two users (0-100)
 * Weight distribution:
 *  - Interest match: 40%
 *  - Skill exchange value: 30%
 *  - Availability overlap: 20%
 *  - Location proximity: 10%
 */
async function calculateCompatibility(userA, userB) {
  try {
    // 1. Interest Match (40%)
    const aLearn = new Set(userA.learn_interests || []);
    const aTeach = new Set(userA.share_interests || []);
    const bLearn = new Set(userB.learn_interests || []);
    const bTeach = new Set(userB.share_interests || []);

    const aCanTeachBCanLearn = [...aTeach].filter(x => bLearn.has(x)).length;
    const bCanTeachACanLearn = [...bTeach].filter(x => aLearn.has(x)).length;

    const maxOverlap = Math.max(aLearn.size, bLearn.size, aTeach.size, bTeach.size) || 1;
    const interestMatch = ((aCanTeachBCanLearn + bCanTeachACanLearn) / maxOverlap) * 100;

    // 2. Skill Exchange Value (30%)
    // Bonus if both can teach each other something (reciprocal)
    const reciprocal = aCanTeachBCanLearn > 0 && bCanTeachACanLearn > 0 ? 100 : 0;

    // 3. Availability Overlap (20%)
    const aAvail = userA.availability || { mon: [], tue: [], wed: [], thu: [], fri: [] };
    const bAvail = userB.availability || { mon: [], tue: [], wed: [], thu: [], fri: [] };
    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];

    let overlapHours = 0;
    days.forEach(day => {
      const aSlots = aAvail[day] || [];
      const bSlots = bAvail[day] || [];
      // Simple overlap: if both have any availability, count 4 hours
      if (aSlots.length > 0 && bSlots.length > 0) {
        overlapHours += 4;
      }
    });

    const availabilityScore = Math.min((overlapHours / 20) * 100, 100);

    // 4. Location Proximity (10%)
    let proximityScore = 0;
    if (userA.location && userB.location) {
      // Simple: same city/region = 100, > 50km away = 0
      // In production, use geocoding API
      proximityScore = userA.location === userB.location ? 100 : 30;
    } else {
      proximityScore = 50; // neutral if location not set
    }

    // Weighted average
    const score =
      (interestMatch * 0.4) +
      (reciprocal * 0.3) +
      (availabilityScore * 0.2) +
      (proximityScore * 0.1);

    return {
      score: Math.round(score),
      breakdown: {
        interestMatch: Math.round(interestMatch),
        skillExchange: reciprocal,
        availability: Math.round(availabilityScore),
        proximity: Math.round(proximityScore),
      },
      details: {
        youCanTeach: [...aTeach].filter(x => bLearn.has(x)),
        theyCanTeach: [...bTeach].filter(x => aLearn.has(x)),
        reciprocal: reciprocal > 0,
      }
    };
  } catch (error) {
    console.error('Error calculating compatibility:', error);
    return { score: 0, breakdown: {}, details: {} };
  }
}

/**
 * Get matches for a user
 * Returns: array of {user, score, breakdown, details}
 */
async function getMatches(userId) {
  try {
    // Get current user
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }
    const user = userDoc.data();

    // Validate user profile completeness
    if (!user.is_onboarded || !user.verified) {
      return [];
    }

    // Find opposite identity users (exclude self)
    const oppositeIdentity = user.identity === 'Senior' ? 'Youth' : 'Senior';
    const candidatesSnap = await db.collection('users')
      .where('identity', '==', oppositeIdentity)
      .where('is_onboarded', '==', true)
      .where('verified', '==', true)
      .get();

    // Exclude existing mentorships
    const existingMentorships = await db.collection('mentorships')
      .where('seniorId', 'in', [userId])
      .where('status', 'in', ['pending', 'accepted', 'active'])
      .get();

    const mentorshipIds = new Set(
      existingMentorships.docs.map(doc =>
        user.identity === 'Senior' ? doc.data().youthId : doc.data().seniorId
      )
    );

    // Score all candidates
    const scored = [];
    for (const candidateDoc of candidatesSnap.docs) {
      const candidate = candidateDoc.data();
      if (candidateDoc.id === userId || mentorshipIds.has(candidateDoc.id)) {
        continue;
      }

      const compat = await calculateCompatibility(user, candidate);
      if (compat.score > 20) { // Minimum threshold
        scored.push({
          id: candidateDoc.id,
          ...candidate,
          compatibility_score: compat.score,
          ...compat.details,
        });
      }
    }

    // Sort by score, return top 20
    return scored
      .sort((a, b) => b.compatibility_score - a.compatibility_score)
      .slice(0, 20);

  } catch (error) {
    console.error('Error getting matches:', error);
    throw error;
  }
}

/**
 * Check if two users are compatible for mentorship
 */
async function isCompatible(userId1, userId2) {
  try {
    const user1Doc = await db.collection('users').doc(userId1).get();
    const user2Doc = await db.collection('users').doc(userId2).get();

    if (!user1Doc.exists || !user2Doc.exists) {
      return false;
    }

    const user1 = user1Doc.data();
    const user2 = user2Doc.data();

    // Basic checks
    if (user1.identity === user2.identity) return false; // Same identity
    if (!user1.is_onboarded || !user2.is_onboarded) return false; // Not onboarded
    if (!user1.verified || !user2.verified) return false; // Not verified

    // Check existing mentorship
    const existing = await db.collection('mentorships')
      .where('seniorId', 'in', [userId1, userId2])
      .where('youthId', 'in', [userId1, userId2])
      .where('status', 'in', ['pending', 'accepted', 'active'])
      .limit(1)
      .get();

    if (!existing.empty) return false; // Already mentoring

    // Score check
    const compat = await calculateCompatibility(user1, user2);
    return compat.score > 20;

  } catch (error) {
    console.error('Error checking compatibility:', error);
    return false;
  }
}

module.exports = {
  getMatches,
  isCompatible,
  calculateCompatibility,
};
