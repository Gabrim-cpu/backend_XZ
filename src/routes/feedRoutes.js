import { Router } from 'express';
import { getFeed, createPost } from '../controllers/feedController.js';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken.js';
import { requireUser } from '../middleware/requireUser.js';

const router = Router();

router.use(verifyFirebaseToken);
router.use(requireUser);

router.get('/', getFeed);
router.post('/', createPost);

export default router;
