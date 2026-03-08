import express from 'express';
import { createSupportMessage } from '../controllers/supportController.js';
import { authenticatePatientOptional } from '../middleware/patientAuthMiddleware.js';

const router = express.Router();

/**
 * POST /api/support/contact
 * Create a support contact message
 * 
 * Authentication: Optional (if patient is logged in, patientId and hospitalId are attached)
 * 
 * Body:
 * - name: string (required)
 * - email: string (required, valid email format)
 * - message: string (required, 10-5000 characters)
 */
router.post('/contact', authenticatePatientOptional, createSupportMessage);

export default router;
