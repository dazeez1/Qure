import express from 'express';
import { register, login } from '../controllers/patientAuthController.js';

const router = express.Router();

/**
 * POST /api/patient/auth/register
 * Register a new patient
 * Public route - no authentication required
 */
router.post('/register', register);

/**
 * POST /api/patient/auth/login
 * Login patient
 * Public route - no authentication required
 */
router.post('/login', login);

export default router;
