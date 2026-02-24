import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import {
  isValidEmail,
  isValidPassword,
  validateRequiredFields,
  normalizeEmail,
} from '../utils/validation.js';

/**
 * Register a new patient
 * POST /api/patient/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      gender,
      dateOfBirth,
    } = req.body;

    // Validate required fields
    const requiredFields = ['fullName', 'email', 'password'];
    const validation = validateRequiredFields(req.body, requiredFields);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${validation.missingFields.join(', ')}`,
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Validate password strength
    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      });
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Check for duplicate email (check both Patient and User models)
    const existingPatient = await prisma.patient.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingPatient) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    // Also check User model to prevent email conflicts
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    // Hash password (never store plain text)
    const hashedPassword = await hashPassword(password);

    // Parse dateOfBirth if provided
    let parsedDateOfBirth = null;
    if (dateOfBirth) {
      const date = new Date(dateOfBirth);
      if (!isNaN(date.getTime())) {
        parsedDateOfBirth = date;
      }
    }

    // Create patient
    const patient = await prisma.patient.create({
      data: {
        fullName: fullName.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone?.trim() || null,
        gender: gender?.trim() || null,
        dateOfBirth: parsedDateOfBirth,
      },
    });

    // Return success response (never return password)
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        id: patient.id,
        fullName: patient.fullName,
        email: patient.email,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Login patient
 * POST /api/patient/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Find patient by email
    const patient = await prisma.patient.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        password: true,
        gender: true,
        dateOfBirth: true,
      },
    });

    // Security: Use same error message whether patient exists or password is wrong
    // This prevents email enumeration attacks
    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Compare password with stored hash
    const isPasswordValid = await comparePassword(password, patient.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate JWT token
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Token payload with patientId and type
    const tokenPayload = {
      patientId: patient.id,
      type: 'PATIENT',
    };

    // Token expires in 24 hours
    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: '24h',
    });

    // Login successful
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        patient: {
          id: patient.id,
          fullName: patient.fullName,
          email: patient.email,
          phone: patient.phone,
          gender: patient.gender,
          dateOfBirth: patient.dateOfBirth,
        },
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};
