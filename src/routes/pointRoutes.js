import express from 'express';
import { awardPoints, getSummary, getLeaderboard } from '../controllers/pointController.js';

const router = express.Router();

router.post('/award', awardPoints);
router.get('/leaderboard', getLeaderboard);
router.get('/:userId', getSummary);

export default router;
