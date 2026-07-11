import crypto from 'crypto';
import redis from 'redis';

export class CallManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.activeCalls = new Map(); // Local in-memory for fast access
  }

  /**
   * Create a new call
   * @param {string} callerId - User ID of caller
   * @param {string} receiverId - User ID of receiver
   * @param {string} callType - 'audio' or 'video'
   * @returns {Object} Call object with ID and status
   */
  async initiateCall(callerId, receiverId, callType = 'video') {
    const callId = crypto.randomUUID();
    const timestamp = Date.now();

    const callData = {
      callId,
      callerId,
      receiverId,
      callType,
      status: 'pending', // pending -> connecting -> active -> ended
      createdAt: timestamp,
      answeredAt: null,
      endedAt: null,
      sdpOffer: null,
      sdpAnswer: null,
      iceCandidates: {
        [callerId]: [],
        [receiverId]: [],
      },
    };

    // Store in memory for fast access
    this.activeCalls.set(callId, callData);

    // Store in Redis for persistence/clustering
    await this.redis.setEx(
      `call:${callId}`,
      3600, // 1 hour expiry
      JSON.stringify(callData)
    );

    // Store call ID in receiver's pending calls list
    await this.redis.lPush(
      `calls:pending:${receiverId}`,
      callId
    );

    console.log(`📞 Call initiated: ${callId} from ${callerId} to ${receiverId}`);
    return callData;
  }

  /**
   * Answer a pending call
   */
  async answerCall(callId, receiverId) {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    if (call.receiverId !== receiverId) {
      throw new Error('Unauthorized to answer this call');
    }

    if (call.status !== 'pending') {
      throw new Error(`Cannot answer call with status: ${call.status}`);
    }

    call.status = 'connecting';
    call.answeredAt = Date.now();

    // Update in memory and Redis
    this.activeCalls.set(callId, call);
    await this.redis.setEx(
      `call:${callId}`,
      3600,
      JSON.stringify(call)
    );

    // Remove from pending calls list
    await this.redis.lRem(`calls:pending:${receiverId}`, 1, callId);

    console.log(`✅ Call answered: ${callId}`);
    return call;
  }

  /**
   * Reject a pending call
   */
  async rejectCall(callId, receiverId, reason = 'declined') {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    if (call.receiverId !== receiverId) {
      throw new Error('Unauthorized to reject this call');
    }

    call.status = 'rejected';
    call.rejectedBy = receiverId;
    call.rejectionReason = reason;
    call.endedAt = Date.now();

    this.activeCalls.set(callId, call);
    await this.redis.setEx(`call:${callId}`, 3600, JSON.stringify(call));
    await this.redis.lRem(`calls:pending:${receiverId}`, 1, callId);

    console.log(`❌ Call rejected: ${callId} by ${receiverId}`);
    return call;
  }

  /**
   * End an active call
   */
  async endCall(callId, userId) {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new Error('Unauthorized to end this call');
    }

    call.status = 'ended';
    call.endedAt = Date.now();
    call.endedBy = userId;

    this.activeCalls.set(callId, call);
    await this.redis.setEx(`call:${callId}`, 3600, JSON.stringify(call));

    console.log(`🏁 Call ended: ${callId} by ${userId}`);
    return call;
  }

  /**
   * Get call status
   */
  async getCallStatus(callId) {
    let call = this.activeCalls.get(callId);

    if (!call) {
      // Try to fetch from Redis
      const redisData = await this.redis.get(`call:${callId}`);
      if (!redisData) {
        throw new Error(`Call ${callId} not found`);
      }
      call = JSON.parse(redisData);
      this.activeCalls.set(callId, call);
    }

    return call;
  }

  /**
   * Store SDP offer/answer
   */
  async storeSdp(callId, userId, type, sdp) {
    const call = await this.getCallStatus(callId);

    if (type === 'offer') {
      if (call.callerId !== userId) {
        throw new Error('Only caller can send offer');
      }
      call.sdpOffer = sdp;
    } else if (type === 'answer') {
      if (call.receiverId !== userId) {
        throw new Error('Only receiver can send answer');
      }
      call.sdpAnswer = sdp;
      call.status = 'active';
    }

    this.activeCalls.set(callId, call);
    await this.redis.setEx(`call:${callId}`, 3600, JSON.stringify(call));

    console.log(`📡 SDP ${type} stored for call ${callId}`);
    return call;
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(callId, userId, candidate) {
    const call = await this.getCallStatus(callId);

    if (!call.iceCandidates[userId]) {
      call.iceCandidates[userId] = [];
    }

    call.iceCandidates[userId].push({
      candidate: candidate.candidate,
      sdpMLineIndex: candidate.sdpMLineIndex,
      sdpMid: candidate.sdpMid,
      timestamp: Date.now(),
    });

    this.activeCalls.set(callId, call);
    await this.redis.setEx(`call:${callId}`, 3600, JSON.stringify(call));

    return call.iceCandidates[userId];
  }

  /**
   * Get pending calls for a user
   */
  async getPendingCalls(userId) {
    const callIds = await this.redis.lRange(`calls:pending:${userId}`, 0, -1);
    const calls = [];

    for (const callId of callIds) {
      try {
        const call = await this.getCallStatus(callId);
        if (call.status === 'pending') {
          calls.push(call);
        }
      } catch (err) {
        console.error(`Error fetching call ${callId}:`, err.message);
      }
    }

    return calls;
  }

  /**
   * Cleanup expired calls (called periodically)
   */
  async cleanupExpiredCalls() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [callId, call] of this.activeCalls.entries()) {
      // Remove calls older than 1 hour
      if (now - call.createdAt > 3600000) {
        this.activeCalls.delete(callId);
        cleanedCount++;
      }
    }

    console.log(`🧹 Cleaned up ${cleanedCount} expired calls`);
  }
}

// Export singleton instance
export let callManager = null;

export function initializeCallManager(redisClient) {
  callManager = new CallManager(redisClient);

  // Cleanup every 30 minutes
  setInterval(() => callManager.cleanupExpiredCalls(), 30 * 60 * 1000);

  return callManager;
}
