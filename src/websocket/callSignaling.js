import { callManager } from '../services/CallManager.js';

/**
 * Socket.IO event handlers for WebRTC call signaling
 */
export function setupCallSignaling(io) {
  const userSockets = new Map(); // userId -> socketId mapping

  io.on('connection', (socket) => {
    console.log(`📱 Socket connected: ${socket.id}`);

    /**
     * User joins the call room
     * Triggered when user opens the app
     */
    socket.on('user:register', (userId) => {
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.join(`user:${userId}`); // Join user-specific room

      console.log(`✅ User registered: ${userId} -> ${socket.id}`);
    });

    /**
     * Incoming call notification
     * Sent from caller to receiver
     */
    socket.on('call:incoming', (data) => {
      const { callId, callerId, receiverId, callType } = data;

      // Find receiver's socket
      const receiverSocketId = userSockets.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('call:incoming', {
          callId,
          callerId,
          callType,
          timestamp: Date.now(),
        });
        console.log(`📞 Incoming call signal: ${callerId} -> ${receiverId}`);
      } else {
        console.log(`⚠️ Receiver ${receiverId} not connected`);
      }
    });

    /**
     * Answer call notification
     * Sent from receiver to caller
     */
    socket.on('call:answered', (data) => {
      const { callId, receiverId, callerId } = data;

      const callerSocketId = userSockets.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:answered', {
          callId,
          timestamp: Date.now(),
        });
        console.log(`✅ Call answered: ${callId}`);
      }
    });

    /**
     * Reject call notification
     */
    socket.on('call:rejected', (data) => {
      const { callId, receiverId, callerId, reason } = data;

      const callerSocketId = userSockets.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:rejected', {
          callId,
          reason,
          timestamp: Date.now(),
        });
        console.log(`❌ Call rejected: ${callId}`);
      }
    });

    /**
     * SDP Offer
     * Sent from caller to receiver
     */
    socket.on('sdp:offer', (data) => {
      const { callId, callerId, receiverId, offer } = data;

      const receiverSocketId = userSockets.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('sdp:offer', {
          callId,
          callerId,
          offer,
          timestamp: Date.now(),
        });
        console.log(`📡 SDP Offer sent: ${callId}`);
      }
    });

    /**
     * SDP Answer
     * Sent from receiver to caller
     */
    socket.on('sdp:answer', (data) => {
      const { callId, receiverId, callerId, answer } = data;

      const callerSocketId = userSockets.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('sdp:answer', {
          callId,
          receiverId,
          answer,
          timestamp: Date.now(),
        });
        console.log(`📡 SDP Answer sent: ${callId}`);
      }
    });

    /**
     * ICE Candidate
     * Sent from one peer to another
     */
    socket.on('ice:candidate', (data) => {
      const { callId, fromUserId, toUserId, candidate } = data;

      const targetSocketId = userSockets.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice:candidate', {
          callId,
          fromUserId,
          candidate,
          timestamp: Date.now(),
        });
        // Don't log every ICE candidate to reduce spam
      }
    });

    /**
     * End call notification
     */
    socket.on('call:ended', (data) => {
      const { callId, userId, otherUserId } = data;

      const otherSocketId = userSockets.get(otherUserId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('call:ended', {
          callId,
          timestamp: Date.now(),
        });
        console.log(`🏁 Call ended: ${callId}`);
      }
    });

    /**
     * Disconnect handler
     */
    socket.on('disconnect', () => {
      if (socket.userId) {
        userSockets.delete(socket.userId);
        console.log(`❌ User disconnected: ${socket.userId}`);
      }
    });
  });

  return { userSockets };
}
