import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/authMiddleware.js';
import { requireStaffVerified } from '../middleware/authMiddleware.js';
import { requirePrimaryOrAdmin } from '../middleware/permissionMiddleware.js';
import {
  getOrganization,
  updateOrganization,
} from '../controllers/settingsController.js';

const router = express.Router();

// All settings routes require authentication, STAFF role, and verification
router.use(authenticate);
router.use(requireRole('STAFF'));
router.use(requireStaffVerified);

/**
 * GET /api/settings/organization
 * Get organization settings for logged-in staff
 * All verified staff can view
 */
router.get('/organization', getOrganization);

/**
 * PUT /api/settings/organization
 * Update organization settings
 * Only Primary Staff or Admin can update
 */
router.put('/organization', requirePrimaryOrAdmin, updateOrganization);

export default router;
