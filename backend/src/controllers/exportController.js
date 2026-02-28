import { generateHospitalExport } from '../services/export.service.js';

/**
 * Export Hospital Data Controller
 * GET /api/staff/export
 * Generates and downloads hospital data as CSV
 */
export async function exportHospitalData(req, res, next) {
  try {
    const user = req.user;

    // Ensure user is authenticated
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Check if user is STAFF, ADMIN, or PRIMARY
    const isStaff = user.role === 'STAFF';
    const isAdmin = user.role === 'ADMIN';
    const isPrimary = user.isPrimary === true;

    if (!isStaff && !isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff privileges required.',
      });
    }

    // Extract hospitalId from user
    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Extract days from query (optional, default 7)
    let days = 7;
    if (req.query.days) {
      days = parseInt(req.query.days, 10);
      if (isNaN(days) || days < 1 || days > 365) {
        return res.status(400).json({
          success: false,
          message: 'days must be a number between 1 and 365.',
        });
      }
    }

    // Generate CSV export
    const csvString = await generateHospitalExport({ hospitalId, days });

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hospital-export-${Date.now()}.csv"`
    );

    // Send CSV string as response
    res.send(csvString);
  } catch (error) {
    // Handle service errors
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Internal server error
    console.error('[Export Error] exportHospitalData:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate export.',
    });
  }
}
