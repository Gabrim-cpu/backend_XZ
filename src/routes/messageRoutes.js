import { Router } from 'express';
import { getThreads, getMessages, uploadChatMedia, sendMessage } from '../controllers/messageController.js';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken.js';
import { requireUser } from '../middleware/requireUser.js';

const router = Router();

router.use(verifyFirebaseToken);
router.use(requireUser);

router.get('/threads', getThreads);
router.get('/:threadId', getMessages);
router.post('/upload', uploadChatMedia);
router.post('/send', sendMessage);

export default router;
