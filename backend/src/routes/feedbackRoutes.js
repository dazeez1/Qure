import express from 'express';
import { getHospitalFeedback } from '../controllers/feedbackController.js';

const router = express.Router();

/**
 * GET /api/feedback/hospital/:hospitalId
 * Get hospital feedback (public endpoint)
 * Returns recent feedback for display
 * Public route - no authentication required
 */
router.get('/hospital/:hospitalId', getHospitalFeedback);

export default router;
