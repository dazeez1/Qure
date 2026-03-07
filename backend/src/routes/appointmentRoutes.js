import express from 'express';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import {
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from '../controllers/appointmentController.js';

const router = express.Router();

/**
 * POST /api/appointments
 * Create a new appointment (Patient only)
 */
router.post('/', authenticatePatient, createAppointment);

/**
 * PATCH /api/appointments/:id/reschedule
 * Reschedule an appointment (Patient only)
 * Only the patient who owns the appointment can reschedule it.
 * Only BOOKED appointments can be rescheduled.
 * Body: { appointmentDate: string (ISO date string, required) }
 */
router.patch('/:id/reschedule', authenticatePatient, rescheduleAppointment);

/**
 * PATCH /api/appointments/:id/cancel
 * Cancel an appointment (Patient only)
 */
router.patch('/:id/cancel', authenticatePatient, cancelAppointment);

export default router;
