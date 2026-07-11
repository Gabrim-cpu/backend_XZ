import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import * as callController from '../controllers/callController.js';

const router = express.Router();

// Initiate a new call
router.post('/initiate', authMiddleware, callController.initiateCall);

// Answer a call
router.post('/:callId/answer', authMiddleware, callController.answerCall);

// Reject a call
router.post('/:callId/reject', authMiddleware, callController.rejectCall);

// End a call
router.post('/:callId/end', authMiddleware, callController.endCall);

// Get active call status
router.get('/:callId', authMiddleware, callController.getCallStatus);

// Send ICE candidate
router.post('/:callId/ice-candidate', authMiddleware, callController.sendIceCandidate);

// Send SDP offer/answer
router.post('/:callId/sdp', authMiddleware, callController.sendSdp);

export default router;
