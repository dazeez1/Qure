import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/authMiddleware.js';
import { requireStaffVerified } from '../middleware/authMiddleware.js';
import { requirePrimaryOrAdmin } from '../middleware/permissionMiddleware.js';
import {
  getOrganization,
  updateOrganization,
} from '../controllers/settingsController.js';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  toggleDepartmentStatus,
  deleteDepartment,
} from '../controllers/departmentsController.js';

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

/**
 * GET /api/settings/departments
 * Get all departments for logged-in user's hospital
 * All verified staff can view
 */
router.get('/departments', getDepartments);

/**
 * POST /api/settings/departments
 * Create a new department
 * Only Primary Staff or Admin can create
 */
router.post('/departments', requirePrimaryOrAdmin, createDepartment);

/**
 * PUT /api/settings/departments/:id
 * Update a department
 * Only Primary Staff or Admin can update
 */
router.put('/departments/:id', requirePrimaryOrAdmin, updateDepartment);

/**
 * PATCH /api/settings/departments/:id/status
 * Toggle department status (ACTIVE/INACTIVE)
 * Only Primary Staff or Admin can change status
 */
router.patch('/departments/:id/status', requirePrimaryOrAdmin, toggleDepartmentStatus);

/**
 * DELETE /api/settings/departments/:id
 * Delete a department
 * Only Primary Staff or Admin can delete
 */
router.delete('/departments/:id', requirePrimaryOrAdmin, deleteDepartment);

export default router;
