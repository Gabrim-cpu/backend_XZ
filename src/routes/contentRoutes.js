import { Router } from 'express';
import {
  getPosts,
  createPost,
  getStories,
  createStory,
  getLibrary,
  createLibraryArticle,
  publishLibraryArticle,
  getPendingArticles,
  rejectArticle,
  addComment,
  getComments,
} from '../controllers/contentController.js';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken.js';
import { requireUser } from '../middleware/requireUser.js';

const router = Router();

router.use(verifyFirebaseToken);
router.use(requireUser);

// ============ POSTS ============
router.get('/posts', getPosts);
router.post('/posts', createPost);

// ============ STORIES (Wisdom Archive) ============
router.get('/stories', getStories);
router.post('/stories', createStory);

// ============ LIBRARY (Knowledge Articles) ============
router.get('/library', getLibrary);
router.post('/library', createLibraryArticle);
router.put('/library/:articleId/publish', publishLibraryArticle);

// ============ MODERATION ============
router.get('/moderation/pending', getPendingArticles);
router.delete('/library/:articleId/reject', rejectArticle);

// ============ COMMENTS/REFLECTIONS ============
router.get('/comments', getComments);
router.post('/comments', addComment);

export default router;
