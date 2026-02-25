import express from 'express';
import { authenticate, requireRole, requireStaffOrAdmin, requireStaffVerified } from '../middleware/authMiddleware.js';
import { verifyAccessCode } from '../controllers/authController.js';
import { getStaffQueue } from '../controllers/queueController.js';

const router = express.Router();

// Verification endpoint - requires auth and STAFF role, but NOT verification (they're verifying!)
router.post('/verify-access', authenticate, requireRole('STAFF'), verifyAccessCode);

// All other staff routes require authentication, STAFF or ADMIN role, and verification
router.use(authenticate);
router.use(requireStaffOrAdmin);
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

/**
 * GET /api/staff/queue
 * Get queue entries with filters and pagination
 * Query params: departmentId (Admin only), status, priority, search, dateFrom, dateTo, page, limit
 * Requires: STAFF (Doctor) or ADMIN role
 * Role-aware: Doctor sees assigned only, Admin sees hospital-wide
 */
router.get('/queue', getStaffQueue);

export default router;

