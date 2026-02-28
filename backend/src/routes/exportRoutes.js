import express from 'express';
import { authenticate, requireStaffOrAdmin, requireStaffVerified } from '../middleware/authMiddleware.js';
import { exportHospitalData } from '../controllers/exportController.js';

const router = express.Router();

// All export routes require authentication, STAFF/ADMIN role, and verification
router.use(authenticate);
router.use(requireStaffOrAdmin);
router.use(requireStaffVerified);

/**
 * GET /api/staff/export
 * Export hospital data as CSV
 * Query params: days (optional, default 7)
 * Access: Authenticated staff/admin users
 */
router.get('/export', exportHospitalData);

export default router;
