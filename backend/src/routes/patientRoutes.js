import express from 'express';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import { getPatientAppointments } from '../controllers/appointmentController.js';
import { getPatientQueueStatus, cancelPatientQueueEntry } from '../controllers/queueController.js';
import { getAnnouncements } from '../controllers/announcementController.js';
import { getPatientDashboard } from '../controllers/patientDashboardController.js';
import { createPatientFeedback } from '../controllers/feedbackController.js';
import {
  getPatientProfile,
  updatePatientProfile,
  uploadPatientAvatar,
} from '../controllers/patientProfileController.js';
import { uploadAvatar } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// All patient routes require patient authentication
router.use(authenticatePatient);

/**
 * GET /api/patient/dashboard
 * Patient dashboard data endpoint
 * Returns: currentQueue, upcomingAppointments, notifications
 */
router.get('/dashboard', getPatientDashboard);

/**
 * GET /api/patient/appointments
 * Get patient's appointments (Patient only)
 */
router.get('/appointments', getPatientAppointments);

/**
 * GET /api/patient/queue-status
 * Get patient's active queue status (Patient only)
 */
router.get('/queue-status', getPatientQueueStatus);

/**
 * PATCH /api/patient/queue/:id/cancel
 * Cancel patient's queue entry (Patient only)
 * Only allows cancellation from WAITING, TRIAGE, CALLED statuses
 * Does NOT allow cancellation from IN_CONSULTATION
 */
router.patch('/queue/:id/cancel', cancelPatientQueueEntry);

/**
 * GET /api/patient/announcements
 * Get announcements for patients
 * Access: Authenticated patients
 */
router.get('/announcements', getAnnouncements);

/**
 * POST /api/patient/feedback
 * Create patient feedback
 * Access: Authenticated patients
 * Body: { appointmentId: string, rating: number (1-5), comment?: string }
 * Rules: Appointment must be COMPLETED, patient must own appointment, no duplicate feedback
 */
router.post('/feedback', createPatientFeedback);

/**
 * GET /api/patient/me
 * Get current authenticated patient profile
 * Access: Authenticated patients
 */
router.get('/me', getPatientProfile);

/**
 * PATCH /api/patient/profile
 * Update patient profile (phone and gender only)
 * Email and fullName are NOT editable
 * Access: Authenticated patients
 * Body: { phone?: string, gender?: 'MALE' | 'FEMALE' | 'OTHER' }
 */
router.patch('/profile', updatePatientProfile);

/**
 * POST /api/patient/avatar
 * Upload patient avatar image
 * Access: Authenticated patients
 * Accepts: multipart/form-data with 'avatar' field
 * File types: jpeg, jpg, png
 * Max size: 2MB
 */
router.post('/avatar', uploadAvatar.single('avatar'), uploadPatientAvatar);

export default router;

