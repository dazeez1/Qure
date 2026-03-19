import { getDailyTrends, getPeakHours } from '../services/analytics.service.js';
import prisma from '../config/database.js';

/**
 * Get Daily Trends Controller
 * GET /api/staff/analytics/daily-trends
 * Returns daily queue entry trends over specified days
 */
export const getDailyTrendsController = async (req, res, next) => {
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

    // Role-based scope:
    // doctor => own department only, admin/primary => all or selected filter
    const isDoctor = user.role === 'STAFF' && user.staffRole === 'DOCTOR' && !user.isPrimary;
    let effectiveDepartmentId;
    if (isDoctor) {
      effectiveDepartmentId = user.departmentId;
    } else if (req.query.departmentId) {
      const department = await prisma.department.findFirst({
        where: {
          id: req.query.departmentId,
          hospitalId,
        },
        select: { id: true },
      });
      if (!department) {
        return res.status(404).json({
          success: false,
          message: 'Department not found or does not belong to your hospital.',
        });
      }
      effectiveDepartmentId = req.query.departmentId;
    }

    // Call service function
    const result = await getDailyTrends({
      hospitalId,
      days,
      departmentId: effectiveDepartmentId,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Handle service errors
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Internal server error
    console.error('[Analytics Error] getDailyTrends:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch daily trends.',
    });
  }
};

/**
 * Get Peak Hours Controller
 * GET /api/staff/analytics/peak-hours
 * Returns peak hours analysis over specified days
 */
export const getPeakHoursController = async (req, res, next) => {
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

    // Role-based scope:
    // doctor => own department only, admin/primary => all or selected filter
    const isDoctor = user.role === 'STAFF' && user.staffRole === 'DOCTOR' && !user.isPrimary;
    let effectiveDepartmentId;
    if (isDoctor) {
      effectiveDepartmentId = user.departmentId;
    } else if (req.query.departmentId) {
      const department = await prisma.department.findFirst({
        where: {
          id: req.query.departmentId,
          hospitalId,
        },
        select: { id: true },
      });
      if (!department) {
        return res.status(404).json({
          success: false,
          message: 'Department not found or does not belong to your hospital.',
        });
      }
      effectiveDepartmentId = req.query.departmentId;
    }

    // Call service function
    const result = await getPeakHours({
      hospitalId,
      days,
      departmentId: effectiveDepartmentId,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Handle service errors
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Internal server error
    console.error('[Analytics Error] getPeakHours:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch peak hours.',
    });
  }
};
