import prisma from '../config/database.js';
import { validateRequiredFields } from '../utils/validation.js';

/**
 * Get Organization Settings
 * GET /api/settings/organization
 * Returns hospital data for logged-in staff
 */
export const getOrganization = async (req, res, next) => {
  try {
    const user = req.user;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Fetch hospital data
    const hospital = await prisma.hospital.findUnique({
      where: { id: user.hospitalId },
      select: {
        id: true,
        name: true,
        address: true,
        timeZone: true,
        logoUrl: true,
        accessCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found.',
      });
    }

    // Return hospital data
    res.status(200).json({
      success: true,
      message: 'Organization settings retrieved successfully',
      data: {
        organization: hospital,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Update Organization Settings
 * PUT /api/settings/organization
 * Updates hospital name, address, timeZone, and logoUrl
 * Only Primary Staff or Admin can update
 */
export const updateOrganization = async (req, res, next) => {
  try {
    const user = req.user;
    const { name, address, timeZone, logoUrl } = req.body;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Check if hospital exists
    const existingHospital = await prisma.hospital.findUnique({
      where: { id: user.hospitalId },
    });

    if (!existingHospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found.',
      });
    }

    // Prepare update data (only include provided fields)
    const updateData = {};

    if (name !== undefined) {
      const trimmedName = name?.trim();
      if (!trimmedName || trimmedName.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Hospital name must be at least 2 characters long.',
        });
      }
      updateData.name = trimmedName;
    }

    if (address !== undefined) {
      updateData.address = address?.trim() || null;
    }

    if (timeZone !== undefined) {
      updateData.timeZone = timeZone?.trim() || null;
    }

    if (logoUrl !== undefined) {
      updateData.logoUrl = logoUrl?.trim() || null;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update.',
      });
    }

    // Update hospital
    const updatedHospital = await prisma.hospital.update({
      where: { id: user.hospitalId },
      data: updateData,
      select: {
        id: true,
        name: true,
        address: true,
        timeZone: true,
        logoUrl: true,
        accessCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Return updated hospital data
    res.status(200).json({
      success: true,
      message: 'Organization settings updated successfully',
      data: {
        organization: updatedHospital,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};
