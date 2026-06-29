import { Router } from 'express';
import { sendRequest, acceptRequest, rejectRequest, getMatches, getRecommendationsHandler, getPendingRequests, getSentRequests, getAcceptedConnections, getAllUsers } from '../controllers/connectionController.js';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken.js';
import { requireUser } from '../middleware/requireUser.js';

const router = Router();

router.use(verifyFirebaseToken); // Authenticate with Firebase
router.use(requireUser);         // Attach DB user to req.user

router.post('/request', sendRequest);
router.post('/accept', acceptRequest);
router.post('/reject', rejectRequest);
router.get('/matches', getMatches);
router.get('/recommendations', getRecommendationsHandler);
router.get('/requests', getPendingRequests);
router.get('/sent-requests', getSentRequests);
router.get('/accepted', getAcceptedConnections);
router.get('/all-users', getAllUsers);

export default router;
