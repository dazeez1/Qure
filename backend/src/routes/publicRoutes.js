import express from 'express';
import { getHospitals, getHospitalDepartments } from '../controllers/publicController.js';

const router = express.Router();

/**
 * GET /api/public/hospitals
 * Get all hospitals (public endpoint)
 * Returns hospitals that have at least one active department
 * Public route - no authentication required
 */
router.get('/hospitals', getHospitals);

/**
 * GET /api/public/hospitals/:hospitalId/departments
 * Get departments for a specific hospital (public endpoint)
 * Returns all active departments for the specified hospital
 * Public route - no authentication required
 */
router.get('/hospitals/:hospitalId/departments', getHospitalDepartments);

export default router;
