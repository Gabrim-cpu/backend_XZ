import { Router } from 'express';
import { getFeed, createPost, toggleLike } from '../controllers/feedController.js';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken.js';
import { requireUser } from '../middleware/requireUser.js';

const router = Router();

router.use(verifyFirebaseToken);
router.use(requireUser);

router.get('/', getFeed);
router.post('/', createPost);
router.post('/:postId/like', toggleLike);

export default router;
