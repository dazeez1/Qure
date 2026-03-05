import express from 'express';
import { authenticate, requireRole, requireStaffOrAdmin, requireStaffVerified } from '../middleware/authMiddleware.js';
import { verifyAccessCode } from '../controllers/authController.js';
import { getStaffQueue, getDashboardSummary, checkInToQueueStaff } from '../controllers/queueController.js';
import { getStaffDashboard } from '../controllers/staffController.js';
import { exportHospitalData } from '../controllers/exportController.js';
import { getStaffAppointmentsController, cancelAppointmentStaff, markAppointmentNoShow, rescheduleAppointment, updateAppointment, sendAppointmentMessage, getAppointmentDoctors, assignAppointmentDoctor } from '../controllers/staffAppointmentController.js';

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
 * POST /api/staff/queue/check-in
 * Staff-assisted appointment check-in
 * Body: { appointmentId: string }
 * Requires: STAFF or ADMIN role (verified)
 * Allows staff to check in a patient's appointment to the queue
 */
router.post('/queue/check-in', checkInToQueueStaff);

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

/**
 * PATCH /api/staff/appointments/:id/cancel
 * Cancel an appointment (Staff)
 * Requires: STAFF or ADMIN role (verified)
 * Allows staff to cancel a patient's appointment
 * Rules: Only BOOKED appointments can be cancelled, and only if no active queue entry exists
 */
router.patch('/appointments/:id/cancel', cancelAppointmentStaff);

/**
 * PATCH /api/staff/appointments/:id/no-show
 * Mark appointment as NO_SHOW (Staff)
 * Requires: STAFF or ADMIN role (verified)
 * Allows staff to mark a patient's appointment as no-show
 * Rules: Only BOOKED appointments can be marked, and appointment date must be in the past
 */
router.patch('/appointments/:id/no-show', markAppointmentNoShow);

/**
 * PATCH /api/staff/appointments/:id/reschedule
 * Reschedule an appointment (Staff)
 * Requires: STAFF or ADMIN role (verified)
 * Allows staff to reschedule a patient's appointment
 * Body: { appointmentDate: string (ISO date string) }
 * Rules: Only BOOKED appointments can be rescheduled, new date must be future, no overlaps
 */
router.patch('/appointments/:id/reschedule', rescheduleAppointment);

/**
 * PATCH /api/staff/appointments/:id
 * Update appointment details (notes and reason)
 * Requires: STAFF or ADMIN role (verified)
 * Body: { notes: string (optional), reason: string (optional) }
 * Allows editing notes and reason for any appointment status
 */
router.patch('/appointments/:id', updateAppointment);

/**
 * POST /api/staff/appointments/:id/message
 * Send message/notification to patient
 * Requires: STAFF or ADMIN role (verified)
 * Body: { message: string (required) }
 * Sends email notification and creates in-app announcement for patient
 */
router.post('/appointments/:id/message', sendAppointmentMessage);

/**
 * GET /api/staff/appointments/:id/doctors
 * Get available doctors for appointment's department
 * Requires: ADMIN role (verified)
 * Returns list of doctors in the appointment's department
 */
router.get('/appointments/:id/doctors', getAppointmentDoctors);

/**
 * PATCH /api/staff/appointments/:id/assign-doctor
 * Assign/reassign doctor to appointment
 * Requires: ADMIN role (verified)
 * Body: { doctorId: string | null (required) }
 * Assigns or reassigns a doctor to an appointment's queue entry
 */
router.patch('/appointments/:id/assign-doctor', assignAppointmentDoctor);

export default router;

