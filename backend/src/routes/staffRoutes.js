import express from 'express';
import { authenticate, requireRole, requireStaffVerified } from '../middleware/authMiddleware.js';
import { verifyAccessCode } from '../controllers/authController.js';

const router = express.Router();

// Verification endpoint - requires auth and STAFF role, but NOT verification (they're verifying!)
router.post('/verify-access', authenticate, requireRole('STAFF'), verifyAccessCode);

// All other staff routes require authentication, STAFF role, and verification
router.use(authenticate);
router.use(requireRole('STAFF'));
router.use(requireStaffVerified);

/**
 * GET /api/staff/dashboard
 * Staff dashboard data endpoint
 */
router.get('/dashboard', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Access granted to staff dashboard',
    data: {
      user: req.user,
      // Dashboard data will be added later
    },
  });
});

export default router;

