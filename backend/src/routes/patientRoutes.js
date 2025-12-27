import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// All patient routes require authentication and PATIENT role
router.use(authenticate);
router.use(requireRole('PATIENT'));

/**
 * GET /api/patient/dashboard
 * Patient dashboard data endpoint
 */
router.get('/dashboard', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Access granted to patient dashboard',
    data: {
      user: req.user,
      // Dashboard data will be added later
    },
  });
});

export default router;

