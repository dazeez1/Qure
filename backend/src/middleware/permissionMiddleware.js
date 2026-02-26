/**
 * Permission Middleware
 * Handles role-based and primary user permissions
 */

/**
 * Require Primary Staff or Admin role
 * Only users with isPrimary === true OR role === ADMIN can access
 * Must be used AFTER authenticate middleware
 * @returns {Function} - Express middleware function
 */
export const requirePrimaryOrAdmin = (req, res, next) => {
  // Ensure user is authenticated (from authenticate middleware)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  // Check if user is primary staff or admin
  const isPrimary = req.user.isPrimary === true;
  const isAdmin = req.user.role === 'ADMIN';

  if (!isPrimary && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only primary staff or administrators can perform this action.',
    });
  }

  // User has permission - continue
  next();
};

/**
 * Require Admin role OR Primary staff
 * Allows users with role === ADMIN OR isPrimary === true
 * Must be used AFTER authenticate middleware
 * This is for endpoints that were previously ADMIN-only but should also allow Primary staff
 * @returns {Function} - Express middleware function
 */
export const requireAdminOrPrimary = (req, res, next) => {
  // Ensure user is authenticated (from authenticate middleware)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  // Check if user is admin or primary staff
  const isAdmin = req.user.role === 'ADMIN';
  const isPrimary = req.user.isPrimary === true;

  if (!isAdmin && !isPrimary) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role or Primary staff required.',
    });
  }

  // User has permission - continue
  next();
};
