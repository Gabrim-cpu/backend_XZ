import { callManager } from '../services/CallManager.js';
import { db } from '../config/firebase.js';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Initiate a new call
 * POST /api/calls/initiate
 */
export async function initiateCall(req, res) {
  try {
    const { receiverId, callType = 'video' } = req.body;
    const callerId = req.user.uid;

    if (!receiverId) {
      return res.status(400).json({ error: 'receiverId is required' });
    }

    if (callerId === receiverId) {
      return res.status(400).json({ error: 'Cannot call yourself' });
    }

    // Create the call
    const call = await callManager.initiateCall(callerId, receiverId, callType);

    // Send notification to receiver via Firestore
    try {
      await updateDoc(doc(db, 'notifications', `call_${call.callId}`), {
        type: 'incoming_call',
        recipientUid: receiverId,
        senderId: callerId,
        callId: call.callId,
        callType: callType,
        createdAt: serverTimestamp(),
        read: false,
        important: true,
      });
    } catch (err) {
      console.error('Notification error (non-critical):', err.message);
    }

    res.json({
      success: true,
      call,
    });
  } catch (err) {
    console.error('Error initiating call:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Answer a pending call
 * POST /api/calls/:callId/answer
 */
export async function answerCall(req, res) {
  try {
    const { callId } = req.params;
    const receiverId = req.user.uid;

    const call = await callManager.answerCall(callId, receiverId);

    res.json({
      success: true,
      call,
    });
  } catch (err) {
    console.error('Error answering call:', err);
    res.status(400).json({ error: err.message });
  }
}

/**
 * Reject a pending call
 * POST /api/calls/:callId/reject
 */
export async function rejectCall(req, res) {
  try {
    const { callId } = req.params;
    const { reason } = req.body;
    const receiverId = req.user.uid;

    const call = await callManager.rejectCall(callId, receiverId, reason);

    res.json({
      success: true,
      call,
    });
  } catch (err) {
    console.error('Error rejecting call:', err);
    res.status(400).json({ error: err.message });
  }
}

/**
 * End an active call
 * POST /api/calls/:callId/end
 */
export async function endCall(req, res) {
  try {
    const { callId } = req.params;
    const userId = req.user.uid;

    const call = await callManager.endCall(callId, userId);

    res.json({
      success: true,
      call,
    });
  } catch (err) {
    console.error('Error ending call:', err);
    res.status(400).json({ error: err.message });
  }
}

/**
 * Get call status
 * GET /api/calls/:callId
 */
export async function getCallStatus(req, res) {
  try {
    const { callId } = req.params;

    const call = await callManager.getCallStatus(callId);

    res.json({
      success: true,
      call,
    });
  } catch (err) {
    console.error('Error getting call status:', err);
    res.status(404).json({ error: err.message });
  }
}

/**
 * Send SDP offer/answer
 * POST /api/calls/:callId/sdp
 */
export async function sendSdp(req, res) {
  try {
    const { callId } = req.params;
    const { type, sdp } = req.body;
    const userId = req.user.uid;

    if (!type || !sdp) {
      return res.status(400).json({ error: 'type and sdp are required' });
    }

    if (!['offer', 'answer'].includes(type)) {
      return res.status(400).json({ error: 'type must be "offer" or "answer"' });
    }

    const call = await callManager.storeSdp(callId, userId, type, sdp);

    res.json({
      success: true,
      call,
    });
  } catch (err) {
    console.error('Error sending SDP:', err);
    res.status(400).json({ error: err.message });
  }
}

/**
 * Send ICE candidate
 * POST /api/calls/:callId/ice-candidate
 */
export async function sendIceCandidate(req, res) {
  try {
    const { callId } = req.params;
    const { candidate } = req.body;
    const userId = req.user.uid;

    if (!candidate) {
      return res.status(400).json({ error: 'candidate is required' });
    }

    const iceCandidates = await callManager.addIceCandidate(callId, userId, candidate);

    res.json({
      success: true,
      iceCandidates,
    });
  } catch (err) {
    console.error('Error sending ICE candidate:', err);
    res.status(400).json({ error: err.message });
  }
}
