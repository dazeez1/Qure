import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdminOrPrimary } from '../middleware/permissionMiddleware.js';
import {
  createWaitingArea,
  getWaitingAreas,
  updateWaitingArea,
} from '../controllers/waitingAreaController.js';

const router = express.Router();

/**
 * POST /api/waiting-areas
 * Create a new waiting area
 * Access: Admin or Primary Staff only
 */
router.post('/', authenticate, requireAdminOrPrimary, createWaitingArea);

/**
 * GET /api/waiting-areas
 * Get waiting areas for the hospital
 * Access: All authenticated staff (ADMIN, STAFF including doctors)
 * Query params: facility, floor, includeInactive
 */
router.get('/', authenticate, getWaitingAreas);

/**
 * PATCH /api/waiting-areas/:id
 * Update a waiting area
 * Access: Admin or Primary Staff only
 */
router.patch('/:id', authenticate, requireAdminOrPrimary, updateWaitingArea);

export default router;
