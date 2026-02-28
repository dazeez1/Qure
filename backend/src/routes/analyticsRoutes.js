import express from 'express';
import { authenticate, requireStaffOrAdmin, requireStaffVerified } from '../middleware/authMiddleware.js';
import {
  getDailyTrendsController,
  getPeakHoursController,
} from '../controllers/analyticsController.js';

const router = express.Router();

// All analytics routes require authentication, STAFF/ADMIN role, and verification
router.use(authenticate);
router.use(requireStaffOrAdmin);
router.use(requireStaffVerified);

/**
 * GET /api/staff/analytics/daily-trends
 * Get daily queue entry trends
 * Query params: days (optional, default 7)
 * Access: Authenticated staff/admin users
 */
router.get('/daily-trends', getDailyTrendsController);

/**
 * GET /api/staff/analytics/peak-hours
 * Get peak hours analysis
 * Query params: days (optional, default 7)
 * Access: Authenticated staff/admin users
 */
router.get('/peak-hours', getPeakHoursController);

export default router;
