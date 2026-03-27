import prisma from '../config/database.js';
import crypto from 'crypto';
import { hashPassword } from '../utils/password.js';
import { generateResetToken } from '../utils/resetToken.js';
import { isValidEmail, normalizeEmail } from '../utils/validation.js';
import { getDashboardOverview } from '../services/dashboard.service.js';
import { sendStaffInvitationEmail } from '../services/emailService.js';

/**
 * Get All Staff
 * GET /api/settings/staff
 * Returns all staff members for logged-in user's hospital
 * All verified staff can view
 */
export const getStaff = async (req, res, next) => {
  try {
    const user = req.user;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Fetch all staff members (STAFF and ADMIN roles) for the hospital
    const staff = await prisma.user.findMany({
      where: {
        hospitalId: user.hospitalId,
        role: { in: ['STAFF', 'ADMIN'] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        staffRole: true,
        isActive: true,
        isPrimary: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format response with department
    const formattedStaff = staff.map(member => ({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      role: member.role,
      staffRole: member.staffRole,
      department: member.department
        ? {
            id: member.department.id,
            name: member.department.name,
          }
        : null,
      isActive: member.isActive,
      isPrimary: member.isPrimary,
    }));

    // Return staff members
    res.status(200).json({
      success: true,
      data: formattedStaff,
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Invite Staff
 * POST /api/settings/staff/invite
 * Invites a new staff member to the hospital
 * Only Primary Staff or Admin can invite
 */
export const inviteStaff = async (req, res, next) => {
  try {
    const user = req.user;
    const { firstName, lastName, email, role, staffRole, departmentId } =
      req.body;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Validate required fields
    if (
      !firstName ||
      typeof firstName !== 'string' ||
      firstName.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'First name is required.',
      });
    }

    if (
      !lastName ||
      typeof lastName !== 'string' ||
      lastName.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Last name is required.',
      });
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    // Validate email format
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    // Check for duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Validate role
    if (!role || (role !== 'STAFF' && role !== 'ADMIN')) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either STAFF or ADMIN.',
      });
    }

    // Permission checks
    const isPrimary = user.isPrimary === true;
    const isAdmin = user.role === 'ADMIN';

    // Only Primary can invite ADMIN
    if (role === 'ADMIN' && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Only primary staff can invite administrators.',
      });
    }

    // Only Primary or Admin can invite STAFF
    if (role === 'STAFF' && !isPrimary && !isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          'Only primary staff or administrators can invite staff members.',
      });
    }

    // Validate role-specific requirements
    if (role === 'ADMIN') {
      // ADMIN cannot have staffRole or departmentId
      if (staffRole !== null && staffRole !== undefined) {
        return res.status(400).json({
          success: false,
          message: 'Admin role cannot have a staff role assigned.',
        });
      }

      if (departmentId !== null && departmentId !== undefined) {
        return res.status(400).json({
          success: false,
          message: 'Admin role cannot be assigned to a department.',
        });
      }
    } else if (role === 'STAFF') {
      // STAFF must have staffRole and departmentId
      if (!staffRole || (staffRole !== 'DOCTOR' && staffRole !== 'NURSE')) {
        return res.status(400).json({
          success: false,
          message: 'Staff role must have a valid staffRole (DOCTOR or NURSE).',
        });
      }

      if (!departmentId) {
        return res.status(400).json({
          success: false,
          message: 'Department is required for staff members.',
        });
      }

      // Verify department exists and belongs to same hospital
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
      });

      if (!department) {
        return res.status(404).json({
          success: false,
          message: 'Department not found.',
        });
      }

      if (department.hospitalId !== user.hospitalId) {
        return res.status(403).json({
          success: false,
          message: 'Department does not belong to your hospital.',
        });
      }
    }

    // Generate temporary password (will be reset via invite token)
    const temporaryPassword = await hashPassword(
      crypto.randomBytes(32).toString('hex')
    );

    // Create user
    const newUser = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        password: temporaryPassword,
        role: role,
        staffRole: role === 'STAFF' ? staffRole : null,
        departmentId: role === 'STAFF' ? departmentId : null,
        hospitalId: user.hospitalId,
        isPrimary: false,
        isVerified: true, // Invited staff are auto-verified
        isActive: false, // Inactive until they accept invite
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        staffRole: true,
        isActive: true,
        isPrimary: true,
      },
    });

    // Generate invite token
    const inviteToken = generateResetToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    // Create invite token
    await prisma.passwordResetToken.create({
      data: {
        token: inviteToken,
        userId: newUser.id,
        expiresAt: expiresAt,
        used: false,
      },
    });

    // Generate invite link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Vercel build outputs `accept-invite.html`, so the email link must include the extension
    const inviteUrl = `${frontendUrl}/accept-invite.html?token=${inviteToken}`;

    // Get hospital name for email
    const hospital = await prisma.hospital.findUnique({
      where: { id: user.hospitalId },
      select: { name: true },
    });

    const hospitalName = hospital?.name || 'Hospital';
    const inviterName = `${user.firstName} ${user.lastName}`;

    // Send invitation email
    try {
      console.log('\n📧 Sending staff invitation email...');
      console.log('   To:', normalizedEmail);
      console.log('   Name:', `${firstName} ${lastName}`);
      console.log('   Role:', role);

      const emailResult = await sendStaffInvitationEmail(
        normalizedEmail,
        inviteUrl,
        firstName.trim(),
        inviterName,
        hospitalName,
        role,
        role === 'STAFF' ? staffRole : null
      );

      if (emailResult.success) {
        console.log('✅ Invitation email sent successfully!');
        console.log('   Message ID:', emailResult.messageId);
      } else {
        console.error('❌ Failed to send invitation email:', emailResult.error);
        // Don't fail the request - invite is still created
        console.log('   Invite link (manual):', inviteUrl);
      }
    } catch (emailError) {
      console.error('❌ Error sending invitation email:', emailError);
      // Don't fail the request - invite is still created
      console.log('   Invite link (manual):', inviteUrl);
    }

    console.log('   Invite Link:', inviteUrl);
    console.log('   Expires:', expiresAt.toISOString());
    console.log('');

    // Return success
    res.status(201).json({
      success: true,
      message: 'Staff invited successfully. Invitation email has been sent.',
    });
  } catch (error) {
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Get Staff Dashboard Overview
 * GET /api/staff/dashboard-overview
 *
 * Thin controller that delegates all business logic to the dashboard service.
 */
export const getStaffDashboard = async (req, res) => {
  try {
    const user = req.user;

    // Basic access control: only STAFF, ADMIN, or primary staff can access
    if (
      !user ||
      (!['STAFF', 'ADMIN'].includes(user.role) && user.isPrimary !== true)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin privileges required.',
      });
    }

    const hospitalId = user.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    const { departmentId: queryDepartmentId, search } = req.query;

    // Scope by role: doctors see only their department; admins/primary see all or filtered
    const isDoctor =
      user.role === 'STAFF' && user.staffRole === 'DOCTOR' && !user.isPrimary;
    const effectiveDepartmentId = isDoctor
      ? user.departmentId
      : queryDepartmentId || undefined;

    const [dashboardData, department] = await Promise.all([
      getDashboardOverview({
        hospitalId,
        departmentId: effectiveDepartmentId,
        search,
      }),
      isDoctor && user.departmentId
        ? prisma.department.findUnique({
            where: { id: user.departmentId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    const response = {
      ...dashboardData,
      userContext:
        isDoctor && user.departmentId
          ? {
              departmentId: user.departmentId,
              departmentName: department?.name ?? null,
              isDoctor: true,
            }
          : undefined,
    };

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('[Dashboard Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Update Staff
 * PUT /api/settings/staff/:id
 * Updates a staff member's information
 * Only Primary Staff or Admin can update
 */
export const updateStaff = async (req, res, next) => {
  try {
    const user = req.user; // Current user making the request
    const { id } = req.params; // Staff member ID to update
    const { firstName, lastName, role, staffRole, departmentId, isActive } =
      req.body;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Permission checks
    const isPrimary = user.isPrimary === true;
    const isAdmin = user.role === 'ADMIN';

    // Only Primary or Admin can update staff
    if (!isPrimary && !isAdmin) {
      return res.status(403).json({
        success: false,
        message:
          'Only primary staff or administrators can update staff members.',
      });
    }

    // Find the staff member to update
    const staffMember = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        staffRole: true,
        departmentId: true,
        isActive: true,
        isPrimary: true,
        hospitalId: true,
      },
    });

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found.',
      });
    }

    // Ensure staff member belongs to same hospital
    if (staffMember.hospitalId !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Staff member does not belong to your hospital.',
      });
    }

    // CRITICAL: Prevent modifying Primary staff (including self)
    // There should only be one Primary per hospital, and it cannot be modified
    if (staffMember.isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Primary staff cannot be modified.',
      });
    }

    // Prevent self-demotion (user cannot change their own role to a lower role)
    if (user.id === staffMember.id) {
      // Check if trying to change role
      if (role && role !== staffMember.role) {
        // ADMIN -> STAFF is demotion (not allowed)
        if (staffMember.role === 'ADMIN' && role === 'STAFF') {
          return res.status(403).json({
            success: false,
            message: 'You cannot demote yourself.',
          });
        }
        // STAFF -> ADMIN is promotion (allowed for primary)
        // But we'll allow it if they're primary
      }
    }

    // Restrict Admin from modifying Admin or promoting to ADMIN
    if (isAdmin && !isPrimary) {
      // Admin cannot modify other Admins
      if (staffMember.role === 'ADMIN' && user.id !== staffMember.id) {
        return res.status(403).json({
          success: false,
          message: 'Administrators cannot modify other administrators.',
        });
      }

      // Admin cannot promote anyone to ADMIN
      if (role === 'ADMIN' && staffMember.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Only primary staff can promote users to administrator.',
        });
      }
    }

    // Build update data object
    const updateData = {};

    // Update firstName if provided
    if (firstName !== undefined) {
      if (typeof firstName !== 'string' || firstName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'First name must be a non-empty string.',
        });
      }
      updateData.firstName = firstName.trim();
    }

    // Update lastName if provided
    if (lastName !== undefined) {
      if (typeof lastName !== 'string' || lastName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Last name must be a non-empty string.',
        });
      }
      updateData.lastName = lastName.trim();
    }

    // Update role if provided
    if (role !== undefined) {
      if (role !== 'STAFF' && role !== 'ADMIN') {
        return res.status(400).json({
          success: false,
          message: 'Role must be either STAFF or ADMIN.',
        });
      }

      // Validate role-specific requirements
      if (role === 'ADMIN') {
        // ADMIN cannot have staffRole or departmentId
        updateData.role = 'ADMIN';
        updateData.staffRole = null;
        updateData.departmentId = null;
      } else if (role === 'STAFF') {
        // STAFF must have staffRole and departmentId
        if (!staffRole || (staffRole !== 'DOCTOR' && staffRole !== 'NURSE')) {
          return res.status(400).json({
            success: false,
            message:
              'Staff role must have a valid staffRole (DOCTOR or NURSE).',
          });
        }

        if (!departmentId) {
          return res.status(400).json({
            success: false,
            message: 'Department is required for staff members.',
          });
        }

        // Verify department exists and belongs to same hospital
        const department = await prisma.department.findUnique({
          where: { id: departmentId },
        });

        if (!department) {
          return res.status(404).json({
            success: false,
            message: 'Department not found.',
          });
        }

        if (department.hospitalId !== user.hospitalId) {
          return res.status(403).json({
            success: false,
            message: 'Department does not belong to your hospital.',
          });
        }

        updateData.role = 'STAFF';
        updateData.staffRole = staffRole;
        updateData.departmentId = departmentId;
      }
    } else {
      // Role not being changed, but staffRole or departmentId might be
      if (staffRole !== undefined || departmentId !== undefined) {
        // If current role is ADMIN, cannot set staffRole or departmentId
        if (staffMember.role === 'ADMIN') {
          return res.status(400).json({
            success: false,
            message:
              'Admin role cannot have a staff role or department assigned.',
          });
        }

        // If current role is STAFF, validate staffRole and departmentId
        if (staffMember.role === 'STAFF') {
          if (staffRole !== undefined) {
            if (
              !staffRole ||
              (staffRole !== 'DOCTOR' && staffRole !== 'NURSE')
            ) {
              return res.status(400).json({
                success: false,
                message: 'Staff role must be either DOCTOR or NURSE.',
              });
            }
            updateData.staffRole = staffRole;
          }

          if (departmentId !== undefined) {
            if (!departmentId) {
              return res.status(400).json({
                success: false,
                message: 'Department is required for staff members.',
              });
            }

            // Verify department exists and belongs to same hospital
            const department = await prisma.department.findUnique({
              where: { id: departmentId },
            });

            if (!department) {
              return res.status(404).json({
                success: false,
                message: 'Department not found.',
              });
            }

            if (department.hospitalId !== user.hospitalId) {
              return res.status(403).json({
                success: false,
                message: 'Department does not belong to your hospital.',
              });
            }

            updateData.departmentId = departmentId;
          }
        }
      }
    }

    // Update isActive if provided (soft deactivate)
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive must be a boolean value.',
        });
      }

      // Prevent self-deactivation (safety check)
      if (user.id === staffMember.id && !isActive) {
        return res.status(403).json({
          success: false,
          message: 'You cannot deactivate yourself.',
        });
      }

      // Prevent deactivating primary staff (already blocked above, but double-check)
      if (staffMember.isPrimary && !isActive) {
        return res.status(403).json({
          success: false,
          message: 'Cannot deactivate primary staff member.',
        });
      }

      // CRITICAL: Admin cannot deactivate another Admin
      // This is already covered by the Admin modification block above,
      // but adding explicit check here for clarity
      if (
        isAdmin &&
        !isPrimary &&
        staffMember.role === 'ADMIN' &&
        user.id !== staffMember.id
      ) {
        return res.status(403).json({
          success: false,
          message: 'Administrators cannot modify other administrators.',
        });
      }

      updateData.isActive = isActive;
    }

    // If no updates provided, return error
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update.',
      });
    }

    // Update staff member
    const updatedStaff = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        staffRole: true,
        isActive: true,
        isPrimary: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Format response
    const formattedStaff = {
      id: updatedStaff.id,
      firstName: updatedStaff.firstName,
      lastName: updatedStaff.lastName,
      email: updatedStaff.email,
      role: updatedStaff.role,
      staffRole: updatedStaff.staffRole,
      isActive: updatedStaff.isActive,
      isPrimary: updatedStaff.isPrimary,
      department: updatedStaff.department
        ? {
            id: updatedStaff.department.id,
            name: updatedStaff.department.name,
          }
        : null,
    };

    // Return success
    res.status(200).json({
      success: true,
      message: 'Staff member updated successfully',
      data: formattedStaff,
    });
  } catch (error) {
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A record with this information already exists.',
      });
    }
    // Pass to error handler middleware
    next(error);
  }
};
