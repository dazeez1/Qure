import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import { requireAdminOrPrimary } from '../middleware/permissionMiddleware.js';
import {
  createAnnouncement,
  getAnnouncements,
  updateAnnouncement,
} from '../controllers/announcementController.js';

const router = express.Router();

/**
 * POST /api/announcements
 * Create a new announcement
 * Access: ADMIN or PRIMARY staff only
 */
router.post('/', authenticate, requireAdminOrPrimary, createAnnouncement);

/**
 * GET /api/announcements
 * Get announcements (Staff/Admin)
 * Access: Authenticated staff/admin users
 */
router.get('/', authenticate, getAnnouncements);


/**
 * PATCH /api/announcements/:id
 * Update an announcement
 * Access: ADMIN or PRIMARY staff only
 */
router.patch('/:id', authenticate, requireAdminOrPrimary, updateAnnouncement);

export default router;
