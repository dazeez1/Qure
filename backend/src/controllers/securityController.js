import prisma from '../config/database.js';
import crypto from 'crypto';

/**
 * Get Security Settings
 * GET /api/settings/security
 * Returns security settings for logged-in user's hospital
 * Only Primary staff can see the actual access code
 * All verified staff can view accessCodeRequired and updatedAt
 */
export const getSecuritySettings = async (req, res, next) => {
  try {
    const user = req.user;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Fetch hospital with only necessary fields
    const hospital = await prisma.hospital.findUnique({
      where: { id: user.hospitalId },
      select: {
        accessCodeRequired: true,
        accessCode: true,
        updatedAt: true,
      },
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found.',
      });
    }

    // Build response data
    const responseData = {
      accessCodeRequired: hospital.accessCodeRequired,
      updatedAt: hospital.updatedAt,
    };

    // Only Primary staff can see the actual access code
    if (user.isPrimary === true) {
      responseData.accessCode = hospital.accessCode;
    } else {
      responseData.accessCode = null;
    }

    // Return clean response
    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Update Security Settings
 * PUT /api/settings/security
 * Updates accessCodeRequired toggle for logged-in user's hospital
 * Only Primary staff can update
 */
export const updateSecuritySettings = async (req, res, next) => {
  try {
    const user = req.user;

    // Explicit Primary check - do NOT rely on middleware alone
    if (!user.isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Only primary staff can update security settings.',
      });
    }

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { accessCodeRequired } = req.body;

    // Validate accessCodeRequired is a boolean
    if (typeof accessCodeRequired !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'accessCodeRequired must be a boolean value.',
      });
    }

    // Update hospital - only accessCodeRequired field
    const updatedHospital = await prisma.hospital.update({
      where: { id: user.hospitalId },
      data: { accessCodeRequired },
      select: {
        accessCodeRequired: true,
      },
    });

    // Return clean response - only the boolean, no access code
    res.status(200).json({
      success: true,
      message: 'Security settings updated successfully',
      data: {
        accessCodeRequired: updatedHospital.accessCodeRequired,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Regenerate Access Code
 * POST /api/settings/security/regenerate
 * Generates a new secure random access code for logged-in user's hospital
 * Only Primary staff can regenerate
 */
export const regenerateAccessCode = async (req, res, next) => {
  try {
    const user = req.user;

    // Step 1 — Explicit Primary check - do NOT rely on middleware alone
    if (!user.isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Only primary staff can regenerate the access code.',
      });
    }

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Step 2 — Generate secure random 8-character uppercase alphanumeric code
    const newCode = crypto
      .randomBytes(6)
      .toString('base64')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 8);

    // Step 3 — Update hospital with new access code
    const updatedHospital = await prisma.hospital.update({
      where: { id: user.hospitalId },
      data: { accessCode: newCode },
      select: {
        accessCode: true,
      },
    });

    // Step 4 — Return new code (Primary only, so safe to return)
    res.status(200).json({
      success: true,
      message: 'Access code regenerated successfully.',
      data: {
        accessCode: updatedHospital.accessCode,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};
