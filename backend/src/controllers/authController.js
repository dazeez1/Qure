import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import {
  isValidEmail,
  isValidPassword,
  validateRequiredFields,
  normalizeEmail,
} from '../utils/validation.js';
import { generateAccessCode } from '../utils/accessCode.js';
import { sendAccessCodeEmail } from '../utils/email.js';

/**
 * Register a new user (Patient or Staff)
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      hospitalName,
      password,
      role,
    } = req.body;

    // Default role to PATIENT if not provided
    const userRole = role || 'PATIENT';

    // Validate role
    const allowedRoles = ['PATIENT', 'STAFF'];
    if (!allowedRoles.includes(userRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected',
      });
    }

    // Define required fields based on role
    const baseRequiredFields = ['firstName', 'lastName', 'email', 'password'];
    const staffRequiredFields = userRole === 'STAFF' ? ['hospitalName'] : [];
    const requiredFields = [...baseRequiredFields, ...staffRequiredFields];

    // Validate required fields
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

    // Check for duplicate email
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

    // Handle hospital logic for STAFF only
    let hospitalId = null;
    let isPrimary = false;
    let accessCode = null;

    if (userRole === 'STAFF' && hospitalName) {
      const trimmedHospitalName = hospitalName.trim();

      // Check if hospital exists by name
      let hospital = await prisma.hospital.findFirst({
        where: {
          name: trimmedHospitalName,
        },
      });

      if (!hospital) {
        // Hospital doesn't exist - create new hospital
        // Generate access code
        accessCode = generateAccessCode();

        // Create hospital
        hospital = await prisma.hospital.create({
          data: {
            name: trimmedHospitalName,
            accessCode,
          },
        });

        // This is the primary staff - auto-verified
        isPrimary = true;
        // Primary staff is automatically verified
      }

      // Link user to hospital
      hospitalId = hospital.id;
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || null,
        gender: gender?.trim() || null,
        hospitalName: userRole === 'STAFF' ? hospitalName.trim() : null,
        password: hashedPassword,
        role: userRole,
        isPrimary,
        isVerified: isPrimary, // Primary staff auto-verified, others default to false
        hospitalId,
      },
    });

    // Send access code email to primary staff only
    if (userRole === 'STAFF' && isPrimary && accessCode) {
      try {
        await sendAccessCodeEmail(
          normalizedEmail,
          accessCode,
          hospitalName.trim()
        );
      } catch (emailError) {
        // Log error but don't fail registration
        // Access code is still created and stored
        console.error('Error sending access code email:', emailError);
      }
    }

    // Return success response (never return password)
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Login user (Patient or Staff)
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    // Note: rememberMe will be used for token expiration in next feature (JWT implementation)

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number and password are required',
      });
    }

    // Normalize email if it's an email address
    let normalizedEmail = null;
    let phoneNumber = null;
    
    // Check if input is an email or phone number
    if (isValidEmail(email)) {
      normalizedEmail = normalizeEmail(email);
    } else {
      // Treat as phone number
      phoneNumber = email.trim();
    }

    // Find user by email or phone number
    let user = null;
    if (normalizedEmail) {
      user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          password: true,
          role: true,
          hospitalName: true,
          isPrimary: true,
          isVerified: true,
        },
      });
    } else {
      user = await prisma.user.findFirst({
        where: { phone: phoneNumber },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          password: true,
          role: true,
          hospitalName: true,
          isPrimary: true,
          isVerified: true,
        },
      });
    }

    // Security: Use same error message whether user exists or password is wrong
    // This prevents email/phone enumeration attacks
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or phone number or password',
      });
    }

    // Validate role if provided (optional, but helps with routing)
    if (role && user.role !== role) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or phone number or password',
      });
    }

    // Compare password with stored hash
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or phone number or password',
      });
    }

    // Generate JWT token
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Token payload (only include necessary data)
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
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
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          hospitalName: user.hospitalName,
          isPrimary: user.isPrimary,
          isVerified: user.isVerified,
        },
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Verify hospital access code for STAFF
 * POST /api/staff/verify-access
 */
export const verifyAccessCode = async (req, res, next) => {
  try {
    const { accessCode } = req.body;

    // Validate required fields
    if (!accessCode) {
      return res.status(400).json({
        success: false,
        message: 'Access code is required',
      });
    }

    const user = req.user;

    // Debug logging
    console.log('🔍 Verify Access Code Debug:', {
      userId: user.id,
      userRole: user.role,
      userHospitalId: user.hospitalId,
      isVerified: user.isVerified,
      providedCode: accessCode,
    });

    // Ensure user is STAFF (middleware should handle this, but double-check)
    if (user.role !== 'STAFF') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Check if already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Access already verified',
      });
    }

    // Check if user has a hospital linked
    if (!user.hospitalId) {
      console.error('❌ User has no hospitalId:', user.id);
      return res.status(400).json({
        success: false,
        message: 'Hospital record not found. Please contact support.',
      });
    }

    // Fetch hospital with access code
    const hospital = await prisma.hospital.findUnique({
      where: { id: user.hospitalId },
      select: {
        id: true,
        name: true,
        accessCode: true,
      },
    });

    if (!hospital) {
      console.error('❌ Hospital not found for hospitalId:', user.hospitalId);
      return res.status(400).json({
        success: false,
        message: 'Hospital record not found. Please contact support.',
      });
    }

    // Compare access codes (case-insensitive, trimmed)
    const providedCode = accessCode.trim().toUpperCase();
    const storedCode = hospital.accessCode.trim().toUpperCase();

    console.log('🔍 Code Comparison:', {
      providedCode,
      storedCode,
      match: providedCode === storedCode,
      hospitalName: hospital.name,
    });

    if (providedCode !== storedCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid hospital access code',
      });
    }

    // Code is valid - verify the user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
      },
    });

    // Success response
    res.status(200).json({
      success: true,
      message: 'Access verified successfully',
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

