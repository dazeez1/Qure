import express from 'express';
import { authenticate, requireRole, requireStaffOrAdmin, requireStaffVerified } from '../middleware/authMiddleware.js';
import { requireAdminOrPrimary } from '../middleware/permissionMiddleware.js';
import { createRoom, getRooms, updateRoom } from '../controllers/roomController.js';

const router = express.Router();

/**
 * POST /api/rooms
 * Create a new room (Admin or Primary only)
 * Body: { name: string, departmentId: string }
 */
router.post('/', authenticate, requireAdminOrPrimary, createRoom);

/**
 * GET /api/rooms
 * Get rooms (Admin + Doctor)
 * Query params: departmentId (optional), includeInactive (optional)
 */
router.get('/', authenticate, requireStaffOrAdmin, requireStaffVerified, getRooms);

/**
 * PATCH /api/rooms/:id
 * Update room (Admin or Primary only)
 * Body: { name?: string, isActive?: boolean }
 */
router.patch('/:id', authenticate, requireAdminOrPrimary, updateRoom);

export default router;
