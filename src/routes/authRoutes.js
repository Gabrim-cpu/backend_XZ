import express from 'express';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken.js';
import { handleAuth, getProfile, updateProfile } from '../controllers/authController.js';

const router = express.Router();

router.post('/session', verifyFirebaseToken, handleAuth);
router.get('/profile', verifyFirebaseToken, getProfile);
router.put('/profile', verifyFirebaseToken, updateProfile);

export default router;