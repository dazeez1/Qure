import express from 'express';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import { getPatientAppointments } from '../controllers/appointmentController.js';
import { getPatientQueueStatus } from '../controllers/queueController.js';

const router = express.Router();

// All patient routes require patient authentication
router.use(authenticatePatient);

/**
 * GET /api/patient/dashboard
 * Patient dashboard data endpoint
 */
router.get('/dashboard', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Access granted to patient dashboard',
    data: {
      patient: req.patient,
      // Dashboard data will be added later
    },
  });
});

/**
 * GET /api/patient/appointments
 * Get patient's appointments (Patient only)
 */
router.get('/appointments', getPatientAppointments);

/**
 * GET /api/patient/queue-status
 * Get patient's active queue status (Patient only)
 */
router.get('/queue-status', getPatientQueueStatus);

export default router;

