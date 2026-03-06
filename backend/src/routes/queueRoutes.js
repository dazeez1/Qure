import express from 'express';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import { authenticate, requireRole, requireStaffVerified } from '../middleware/authMiddleware.js';
import { requireAdminOrPrimary } from '../middleware/permissionMiddleware.js';
import { getQueuePreview, checkInToQueue, updateQueueEntryStatus, bulkUpdateQueueEntryStatus, bulkReassignQueueEntries, bulkAssignWaitingArea, getQueueDoctors, sendQueueEmail, bulkNotifyQueue, updateQueuePriority, getQueueEntryWaitTime } from '../controllers/queueController.js';
import { streamWaitTime } from '../controllers/waitTimeSSEController.js';

/**
 * Combined authentication middleware that supports both patient and staff authentication
 */
const authenticatePatientOrStaff = (req, res, next) => {
  // Try staff authentication first
  authenticate(req, res, (err) => {
    if (!err && req.user && req.user.role !== 'PATIENT') {
      // Staff auth succeeded
      return next();
    }
    // Staff auth failed, try patient auth
    authenticatePatient(req, res, (patientErr) => {
      if (!patientErr && req.patient) {
        // Patient auth succeeded
        return next();
      }
      // Both failed
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    });
  });
};

const router = express.Router();

/**
 * GET /api/queue/preview
 * Get queue preview (read-only)
 * Requires patient authentication only
 * Query params: hospitalId, departmentId
 */
router.get('/preview', authenticatePatient, getQueuePreview);

/**
 * POST /api/queue/check-in
 * Check in to queue (Patient only)
 * Body: { appointmentId: string }
 */
router.post('/check-in', authenticatePatient, checkInToQueue);

/**
 * GET /api/queue/:id/wait-time/stream
 * Stream real-time wait time updates via SSE
 * Requires: STAFF/ADMIN (same hospital) or Patient (owns entry)
 * Note: Must come before other /:id routes
 * Supports both patient and staff authentication
 */
router.get('/:id/wait-time/stream', authenticatePatientOrStaff, streamWaitTime);

/**
 * GET /api/queue/:id/wait-time
 * Get real-time wait time for a queue entry (one-time fetch)
 * Requires: STAFF/ADMIN (same hospital) or Patient (owns entry)
 * Note: Must come before other /:id routes
 * Supports both patient and staff authentication
 */
router.get('/:id/wait-time', authenticatePatientOrStaff, getQueueEntryWaitTime);

/**
 * PATCH /api/queue/:id/status
 * Update queue entry status (Staff doctor only)
 * Requires: STAFF role, assigned doctor only
 * Body: { status: string }
 */
router.patch('/:id/status', authenticate, requireRole('STAFF'), requireStaffVerified, updateQueueEntryStatus);

/**
 * PATCH /api/queue/bulk-status
 * Bulk update queue entry status (Admin or Primary only)
 * Requires: ADMIN role OR isPrimary === true
 * Body: { queueEntryIds: string[], status: string }
 */
router.patch('/bulk-status', authenticate, requireAdminOrPrimary, bulkUpdateQueueEntryStatus);

/**
 * PATCH /api/queue/reassign
 * Bulk reassign queue entries to a new doctor (Admin or Primary only)
 * Requires: ADMIN role OR isPrimary === true
 * Body: { queueEntryIds: string[], newDoctorId: string }
 */
router.patch('/reassign', authenticate, requireAdminOrPrimary, bulkReassignQueueEntries);

/**
 * PATCH /api/queue/bulk-waiting-area
 * Bulk assign queue entries to a waiting area (Admin or Primary only)
 * Requires: ADMIN role OR isPrimary === true
 * Body: { queueEntryIds: string[], waitingAreaId: string }
 */
router.patch('/bulk-waiting-area', authenticate, requireAdminOrPrimary, bulkAssignWaitingArea);

/**
 * GET /api/queue/doctors
 * Get available doctors for queue reassignment (Admin or Primary only)
 * Requires: ADMIN role OR isPrimary === true
 * Returns list of doctors with capacity information
 */
router.get('/doctors', authenticate, requireAdminOrPrimary, getQueueDoctors);

/**
 * POST /api/queue/:id/email
 * Send email notification to patient for queue entry (Staff or Admin)
 * Requires: STAFF or ADMIN role (verified)
 * Body: { message: string (required) }
 */
router.post('/:id/email', authenticate, requireRole('STAFF'), requireStaffVerified, sendQueueEmail);

/**
 * POST /api/queue/bulk-notify
 * Bulk notify patients in queue (Admin or Primary only)
 * Requires: ADMIN role OR isPrimary === true
 * Body: { queueEntryIds: string[], message: string (required) }
 */
router.post('/bulk-notify', authenticate, requireAdminOrPrimary, bulkNotifyQueue);

/**
 * PATCH /api/queue/:id/priority
 * Update queue entry priority (Admin or Primary only)
 * Requires: ADMIN role OR isPrimary === true
 * Body: { priority: string (URGENT, HIGH, NORMAL, LOW) }
 */
router.patch('/:id/priority', authenticate, requireAdminOrPrimary, updateQueuePriority);


export default router;
