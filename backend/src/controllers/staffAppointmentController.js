import { getStaffAppointments } from '../services/staffAppointment.service.js';

/**
 * Get staff appointments with filtering and pagination
 * GET /api/staff/appointments
 * 
 * Query params:
 *   status: string (optional) - Filter by appointment status
 *   departmentId: string (optional) - Filter by department ID
 *   startDate: string (optional) - Filter appointments from this date (ISO string)
 *   endDate: string (optional) - Filter appointments until this date (ISO string)
 *   search: string (optional) - Search by patient full name
 *   page: number (optional, default: 1) - Page number
 *   limit: number (optional, default: 20) - Items per page
 */
export async function getStaffAppointmentsController(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Allow only STAFF, ADMIN, or isPrimary === true
    const { role, isPrimary } = req.user;
    if (role !== 'STAFF' && role !== 'ADMIN' && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff, Admin, or Primary staff only.',
      });
    }

    // Extract hospitalId from req.user.hospitalId
    const hospitalId = req.user.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required. User must be associated with a hospital.',
      });
    }

    // Extract query params
    const {
      status,
      departmentId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    // Convert page and limit to numbers
    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    // Validate page and limit are valid numbers
    if (isNaN(pageNumber) || pageNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page number. Must be a positive integer.',
      });
    }

    if (isNaN(limitNumber) || limitNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid limit. Must be a positive integer.',
      });
    }

    // Call service
    const result = await getStaffAppointments({
      hospitalId,
      status,
      departmentId,
      startDate,
      endDate,
      search,
      page: pageNumber,
      limit: limitNumber,
    });

    // Return success response
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Handle validation errors (400)
    if (error.message && error.message.includes('required')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Handle other errors (500)
    console.error('Error in getStaffAppointmentsController:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to fetch appointments.',
    });
  }
}
