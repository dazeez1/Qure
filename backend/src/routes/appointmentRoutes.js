import express from 'express';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import {
  createAppointment,
  cancelAppointment,
} from '../controllers/appointmentController.js';

const router = express.Router();

/**
 * POST /api/appointments
 * Create a new appointment (Patient only)
 */
router.post('/', authenticatePatient, createAppointment);

/**
 * PATCH /api/appointments/:id/cancel
 * Cancel an appointment (Patient only)
 */
router.patch('/:id/cancel', authenticatePatient, cancelAppointment);

export default router;
