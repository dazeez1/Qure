import express from 'express';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import { authenticate, requireRole, requireStaffVerified } from '../middleware/authMiddleware.js';
import { requireAdminOrPrimary } from '../middleware/permissionMiddleware.js';
import { getQueuePreview, checkInToQueue, updateQueueEntryStatus, bulkUpdateQueueEntryStatus, bulkReassignQueueEntries } from '../controllers/queueController.js';

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

export default router;
