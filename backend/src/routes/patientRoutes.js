import express from 'express';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';

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

export default router;

