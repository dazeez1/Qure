import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

/**
 * Patient Authentication middleware
 * Verifies JWT token for patients and attaches patient to request
 * Handles tokens with payload: { patientId, type: "PATIENT" }
 */
export const authenticatePatient = async (req, res, next) => {
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

    // Verify this is a patient token
    if (!decoded.patientId || decoded.type !== 'PATIENT') {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token. Please log in again.',
      });
    }

    // Fetch patient from database to ensure patient still exists
    const patient = await prisma.patient.findUnique({
      where: { id: decoded.patientId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        gender: true,
        dateOfBirth: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Patient not found. Please log in again.',
      });
    }

    // Attach patient to request object (as req.patient for clarity)
    req.patient = patient;
    // Also attach as req.user for compatibility with existing code
    req.user = {
      id: patient.id,
      email: patient.email,
      role: 'PATIENT',
      type: 'PATIENT',
      fullName: patient.fullName,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
    };

    // Continue to next middleware/route
    next();
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};
