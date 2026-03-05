import prisma from '../config/database.js';
import { sendAnnouncementEmail } from '../services/email.service.js';

/**
 * Create Announcement
 * POST /api/announcements
 * Only ADMIN or PRIMARY users can create announcements
 */
export const createAnnouncement = async (req, res, next) => {
  try {
    const user = req.user;

    // Access control: Only ADMIN or PRIMARY users
    const isAdmin = user.role === 'ADMIN';
    const isPrimary = user.isPrimary === true;

    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin or Primary staff required.',
      });
    }

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Extract from body
    const { audience, title, content, priority } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title is required.',
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Content is required.',
      });
    }

    // Validate audience
    const validAudiences = ['PATIENT', 'STAFF', 'BOTH'];
    if (!audience || !validAudiences.includes(audience)) {
      return res.status(400).json({
        success: false,
        message: 'Audience must be PATIENT, STAFF, or BOTH.',
      });
    }

    // Validate priority (optional, default NORMAL)
    const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    const announcementPriority = priority || 'NORMAL';
    if (!validPriorities.includes(announcementPriority)) {
      return res.status(400).json({
        success: false,
        message: 'Priority must be LOW, NORMAL, HIGH, or URGENT.',
      });
    }

    // Create announcement
    const announcement = await prisma.announcement.create({
      data: {
        hospitalId: user.hospitalId,
        createdBy: user.id,
        audience,
        title: title.trim(),
        content: content.trim(),
        priority: announcementPriority,
        isActive: true,
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send announcement emails (non-blocking - don't fail announcement creation if email fails)
    let emailResult = null;
    try {
      emailResult = await sendAnnouncementEmail({
        hospitalId: user.hospitalId,
        audience,
        title: title.trim(),
        content: content.trim(),
      });

      console.log('[Announcement Controller] Email sending result:', {
        announcementId: announcement.id,
        audience,
        totalRecipients: emailResult.totalRecipients,
        successCount: emailResult.successCount,
        failedCount: emailResult.failedCount,
      });
    } catch (emailError) {
      // Log email error but don't fail the announcement creation
      console.error('[Announcement Controller] Failed to send announcement emails:', {
        announcementId: announcement.id,
        audience,
        error: emailError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Announcement created successfully.',
      data: {
        announcement,
        emailResult: emailResult || null, // Include email result if available
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Announcements
 * GET /api/announcements
 * Role-aware: PATIENT sees PATIENT/BOTH, STAFF/ADMIN sees STAFF/BOTH
 */
export const getAnnouncements = async (req, res, next) => {
  try {
    const user = req.user;

    // Safety check: Ensure user exists
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Determine audience filter based on user type/role
    // CRITICAL SAFETY CHECK: Differentiate between PATIENT and STAFF/ADMIN
    // 
    // Patient route: /api/patient/announcements
    //   - Uses authenticatePatient middleware
    //   - Sets req.patient (patient object)
    //   - Sets req.user with type: 'PATIENT' and role: 'PATIENT'
    //
    // Staff route: /api/announcements
    //   - Uses authenticate middleware
    //   - Does NOT set req.patient
    //   - Sets req.user with role: 'STAFF' or 'ADMIN' (no type field)
    //
    // Safety: Check req.patient first (most reliable - only set by authenticatePatient)
    let audienceFilter = [];
    let hospitalId = null;

    // Check if this is a patient request
    // Priority: req.patient > user.type > user.role
    const isPatient = req.patient !== undefined || user.type === 'PATIENT';

    if (isPatient) {
      // PATIENT LOGIC - Only accessible via /api/patient/announcements route
      // Patient: see PATIENT or BOTH announcements
      audienceFilter = ['PATIENT', 'BOTH'];
      
      // Get hospitalId from patient's active queue entry or most recent appointment
      const activeQueueEntry = await prisma.queueEntry.findFirst({
        where: {
          patientId: user.id,
          status: {
            in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
          },
        },
        select: {
          hospitalId: true,
        },
        orderBy: {
          checkInTime: 'desc',
        },
      });

      if (activeQueueEntry) {
        hospitalId = activeQueueEntry.hospitalId;
      } else {
        // Try to get from most recent appointment
        const recentAppointment = await prisma.appointment.findFirst({
          where: {
            patientId: user.id,
          },
          select: {
            hospitalId: true,
          },
          orderBy: {
            appointmentDate: 'desc',
          },
        });

        if (recentAppointment) {
          hospitalId = recentAppointment.hospitalId;
        } else {
          // If no queue entry or appointment, return empty array
          return res.status(200).json({
            success: true,
            data: {
              announcements: [],
            },
          });
        }
      }
    } else {
      // STAFF/ADMIN LOGIC - Only accessible via /api/announcements route
      // Safety: This branch is only reached if NOT a patient
      // Staff route uses authenticate middleware which ensures role is STAFF or ADMIN
      audienceFilter = ['STAFF', 'BOTH'];
      hospitalId = user.hospitalId;

      if (!hospitalId) {
        return res.status(400).json({
          success: false,
          message: 'No hospital associated with your account.',
        });
      }
    }

    // Fetch announcements
    const announcements = await prisma.announcement.findMany({
      where: {
        hospitalId,
        isActive: true,
        audience: {
          in: audienceFilter,
        },
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return res.status(200).json({
      success: true,
      data: {
        announcements,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Announcement
 * PATCH /api/announcements/:id
 * Only ADMIN or PRIMARY users can update announcements
 */
export const updateAnnouncement = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { title, content, priority, isActive } = req.body;

    // Access control: Only ADMIN or PRIMARY users
    const isAdmin = user.role === 'ADMIN';
    const isPrimary = user.isPrimary === true;

    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin or Primary staff required.',
      });
    }

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'No hospital associated with your account.',
      });
    }

    // Find announcement and verify it belongs to user's hospital
    const existingAnnouncement = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!existingAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found.',
      });
    }

    // Verify hospital ownership
    if (existingAnnouncement.hospitalId !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Announcement does not belong to your hospital.',
      });
    }

    // Build update data
    const updateData = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Title cannot be empty.',
        });
      }
      updateData.title = title.trim();
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Content cannot be empty.',
        });
      }
      updateData.content = content.trim();
    }

    if (priority !== undefined) {
      const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Priority must be LOW, NORMAL, HIGH, or URGENT.',
        });
      }
      updateData.priority = priority;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive must be a boolean.',
        });
      }
      updateData.isActive = isActive;
    }

    // Update announcement
    const updatedAnnouncement = await prisma.announcement.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Announcement updated successfully.',
      data: {
        announcement: updatedAnnouncement,
      },
    });
  } catch (error) {
    next(error);
  }
};
