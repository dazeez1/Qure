import express from 'express';
import { authenticate, requireRole, requireStaffOrAdmin, requireStaffVerified } from '../middleware/authMiddleware.js';
import { verifyAccessCode } from '../controllers/authController.js';
import { getStaffQueue, getDashboardSummary } from '../controllers/queueController.js';
import { getStaffDashboard } from '../controllers/staffController.js';
import { exportHospitalData } from '../controllers/exportController.js';
import { getStaffAppointmentsController } from '../controllers/staffAppointmentController.js';

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
 * Returns comprehensive dashboard overview with queue preview, metrics, and stats
 */
router.get('/dashboard', authenticate, requireStaffOrAdmin, getStaffDashboard);

/**
 * GET /api/staff/dashboard-summary
 * Get dashboard summary with queue counts, waiting areas, rooms, doctors, and today stats
 * Access: ADMIN, Primary Staff (hospital-wide), or DOCTOR (assigned entries only)
 */
router.get('/dashboard-summary', getDashboardSummary);

/**
 * GET /api/staff/queue
 * Get queue entries with filters and pagination
 * Query params: departmentId (Admin only), status, priority, search, dateFrom, dateTo, page, limit
 * Requires: STAFF (Doctor) or ADMIN role
 * Role-aware: Doctor sees assigned only, Admin sees hospital-wide
 */
router.get('/queue', getStaffQueue);

/**
 * GET /api/staff/export
 * Export hospital data as CSV
 * Query params: days (optional, default 7)
 * Access: Authenticated staff/admin users
 */
router.get('/export', exportHospitalData);

/**
 * GET /api/staff/appointments
 * Get hospital appointments with filtering and pagination
 * Query params: status, departmentId, startDate, endDate, search, page, limit
 * Access: Authenticated staff/admin users (verified)
 * Protected by: authenticate → requireStaffOrAdmin → requireStaffVerified
 */
router.get('/appointments', getStaffAppointmentsController);

export default router;

