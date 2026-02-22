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
