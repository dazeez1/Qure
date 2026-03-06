import prisma from '../config/database.js';

/**
 * Get All Departments
 * GET /api/settings/departments
 * Returns all departments for logged-in user's hospital
 * All verified staff can view
 */
export const getDepartments = async (req, res, next) => {
  try {
    const user = req.user;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Fetch all departments for the hospital
    const departments = await prisma.department.findMany({
      where: { hospitalId: user.hospitalId },
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        defaultConsultationTimeMinutes: true,
        avgConsultationTimeMinutes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Return departments
    res.status(200).json({
      success: true,
      message: 'Departments retrieved successfully',
      data: {
        departments,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Create Department
 * POST /api/settings/departments
 * Creates a new department for the logged-in user's hospital
 * Only Primary Staff or Admin can create
 */
export const createDepartment = async (req, res, next) => {
  try {
    const user = req.user;
    const { name, shortCode, status, defaultConsultationTimeMinutes } = req.body;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required.',
      });
    }

    if (!shortCode || typeof shortCode !== 'string' || shortCode.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Short code is required.',
      });
    }

    // Validate shortCode length (3-4 characters)
    const trimmedShortCode = shortCode.trim().toUpperCase();
    if (trimmedShortCode.length < 3 || trimmedShortCode.length > 4) {
      return res.status(400).json({
        success: false,
        message: 'Short code must be 3-4 characters long.',
      });
    }

    // Validate shortCode contains only uppercase letters
    if (!/^[A-Z]+$/.test(trimmedShortCode)) {
      return res.status(400).json({
        success: false,
        message: 'Short code must contain only uppercase letters.',
      });
    }

    // Validate status if provided
    const validStatus = status || 'ACTIVE';
    if (validStatus !== 'ACTIVE' && validStatus !== 'INACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Status must be either ACTIVE or INACTIVE.',
      });
    }

    // Validate defaultConsultationTimeMinutes if provided
    let validDefaultConsultationTime = 15; // Default value
    if (defaultConsultationTimeMinutes !== undefined && defaultConsultationTimeMinutes !== null) {
      const consultationTime = parseInt(defaultConsultationTimeMinutes, 10);
      if (isNaN(consultationTime) || consultationTime < 1 || consultationTime > 120) {
        return res.status(400).json({
          success: false,
          message: 'Default consultation time must be between 1 and 120 minutes.',
        });
      }
      validDefaultConsultationTime = consultationTime;
    }

    // Check for duplicate shortCode within the same hospital
    const existingDepartment = await prisma.department.findUnique({
      where: {
        hospitalId_shortCode: {
          hospitalId: user.hospitalId,
          shortCode: trimmedShortCode,
        },
      },
    });

    if (existingDepartment) {
      return res.status(409).json({
        success: false,
        message: 'A department with this short code already exists in your hospital.',
      });
    }

    // Create department
    const newDepartment = await prisma.department.create({
      data: {
        name: name.trim(),
        shortCode: trimmedShortCode,
        status: validStatus,
        defaultConsultationTimeMinutes: validDefaultConsultationTime,
        hospitalId: user.hospitalId,
      },
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        defaultConsultationTimeMinutes: true,
        avgConsultationTimeMinutes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Return created department
    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: {
        department: newDepartment,
      },
    });
  } catch (error) {
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A department with this short code already exists in your hospital.',
      });
    }
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Update Department
 * PUT /api/settings/departments/:id
 * Updates a department
 * Only Primary Staff or Admin can update
 * Department must belong to same hospital
 */
export const updateDepartment = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { name, shortCode, status, defaultConsultationTimeMinutes } = req.body;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Find department and verify it belongs to user's hospital
    const existingDepartment = await prisma.department.findUnique({
      where: { id },
    });

    if (!existingDepartment) {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }

    // Verify department belongs to user's hospital
    if (existingDepartment.hospitalId !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update departments in your own hospital.',
      });
    }

    // Prepare update data
    const updateData = {};

    if (name !== undefined) {
      const trimmedName = name?.trim();
      if (!trimmedName || trimmedName.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Department name cannot be empty.',
        });
      }
      if (trimmedName.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Department name must be at least 2 characters long.',
        });
      }
      updateData.name = trimmedName;
    }

    if (shortCode !== undefined) {
      const trimmedShortCode = shortCode.trim().toUpperCase();
      if (trimmedShortCode.length < 3 || trimmedShortCode.length > 4) {
        return res.status(400).json({
          success: false,
          message: 'Short code must be 3-4 characters long.',
        });
      }
      if (!/^[A-Z]+$/.test(trimmedShortCode)) {
        return res.status(400).json({
          success: false,
          message: 'Short code must contain only uppercase letters.',
        });
      }

      // Check for duplicate shortCode (excluding current department)
      if (trimmedShortCode !== existingDepartment.shortCode) {
        const duplicateDepartment = await prisma.department.findUnique({
          where: {
            hospitalId_shortCode: {
              hospitalId: user.hospitalId,
              shortCode: trimmedShortCode,
            },
          },
        });

        if (duplicateDepartment) {
          return res.status(409).json({
            success: false,
            message: 'A department with this short code already exists in your hospital.',
          });
        }
      }

      updateData.shortCode = trimmedShortCode;
    }

    if (status !== undefined) {
      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        return res.status(400).json({
          success: false,
          message: 'Status must be either ACTIVE or INACTIVE.',
        });
      }
      updateData.status = status;
    }

    if (defaultConsultationTimeMinutes !== undefined && defaultConsultationTimeMinutes !== null) {
      const consultationTime = parseInt(defaultConsultationTimeMinutes, 10);
      if (isNaN(consultationTime) || consultationTime < 1 || consultationTime > 120) {
        return res.status(400).json({
          success: false,
          message: 'Default consultation time must be between 1 and 120 minutes.',
        });
      }
      updateData.defaultConsultationTimeMinutes = consultationTime;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update.',
      });
    }

    // Update department
    const updatedDepartment = await prisma.department.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        defaultConsultationTimeMinutes: true,
        avgConsultationTimeMinutes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Return updated department
    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: {
        department: updatedDepartment,
      },
    });
  } catch (error) {
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A department with this short code already exists in your hospital.',
      });
    }
    // Handle not found errors
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Toggle Department Status
 * PATCH /api/settings/departments/:id/status
 * Toggles department status between ACTIVE and INACTIVE
 * Only Primary Staff or Admin can change status
 * Department must belong to same hospital
 */
export const toggleDepartmentStatus = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { status } = req.body;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Validate status
    if (!status || (status !== 'ACTIVE' && status !== 'INACTIVE')) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either ACTIVE or INACTIVE.',
      });
    }

    // Find department and verify it belongs to user's hospital
    const existingDepartment = await prisma.department.findUnique({
      where: { id },
    });

    if (!existingDepartment) {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }

    // Verify department belongs to user's hospital
    if (existingDepartment.hospitalId !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update departments in your own hospital.',
      });
    }

    // Update status
    const updatedDepartment = await prisma.department.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Return updated department
    res.status(200).json({
      success: true,
      message: 'Department status updated successfully',
      data: {
        department: updatedDepartment,
      },
    });
  } catch (error) {
    // Handle not found errors
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Delete Department
 * DELETE /api/settings/departments/:id
 * Deletes a department
 * Only Primary Staff or Admin can delete
 * Department must belong to same hospital
 */
export const deleteDepartment = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Find department and verify it belongs to user's hospital
    const existingDepartment = await prisma.department.findUnique({
      where: { id },
    });

    if (!existingDepartment) {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }

    // Verify department belongs to user's hospital
    if (existingDepartment.hospitalId !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete departments in your own hospital.',
      });
    }

    // Delete department (hard delete for now)
    await prisma.department.delete({
      where: { id },
    });

    // Return success
    res.status(200).json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (error) {
    // Handle not found errors
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }
    // Pass to error handler middleware
    next(error);
  }
};
