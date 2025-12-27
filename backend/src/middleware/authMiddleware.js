import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Extract token (remove "Bearer " prefix)
    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Verify token
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.',
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid authentication token. Please log in again.',
        });
      }
      throw error;
    }

    // Fetch user from database to ensure user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        hospitalName: true,
        isPrimary: true,
        isVerified: true,
        hospitalId: true, // Added hospitalId for staff access code verification
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please log in again.',
      });
    }

    // Attach user to request object
    req.user = user;

    // Continue to next middleware/route
    next();
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Role-based authorization middleware
 * Must be used AFTER authenticate middleware
 * @param {string} requiredRole - Required role (PATIENT, STAFF, ADMIN)
 * @returns {Function} - Express middleware function
 */
export const requireRole = (requiredRole) => {
  return (req, res, next) => {
    // Ensure user is authenticated (from authenticate middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Check if user's role matches required role
    if (req.user.role !== requiredRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to access this resource.',
      });
    }

    // Role matches - continue to next middleware/route
    next();
  };
};

/**
 * Staff verification middleware
 * Ensures STAFF users have verified their hospital access code
 * Must be used AFTER authenticate middleware
 * @returns {Function} - Express middleware function
 */
export const requireStaffVerified = (req, res, next) => {
  // Ensure user is authenticated (from authenticate middleware)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  // Only applies to STAFF role
  if (req.user.role !== 'STAFF') {
    // Not a staff member - continue (this middleware is for staff routes)
    return next();
  }

  // Check if staff is verified
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Hospital access code required',
    });
  }

  // Staff is verified - continue
  next();
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't fail if missing
 * Useful for routes that work for both authenticated and unauthenticated users
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - continue without user
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      return next();
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          phone: true,
          hospitalName: true,
          isPrimary: true,
          isVerified: true,
          hospitalId: true,
        },
      });

      if (user) {
        req.user = user;
      }
    } catch (error) {
      // Invalid token - continue without user
      // Don't throw error for optional auth
    }

    next();
  } catch (error) {
    next(error);
  }
};

