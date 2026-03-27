import prisma from '../config/database.js';

/**
 * Get Patient Notification Preferences
 * GET /api/patient/notification-preferences
 * Returns email notification preference for authenticated patient
 * Access: Authenticated patients
 */
export const getPatientNotificationPreferences = async (req, res, next) => {
  try {
    const patientId = req.user.id;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        emailNotificationsEnabled: true,
        pushNotificationsEnabled: true,
      },
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found.',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        emailNotificationsEnabled: patient.emailNotificationsEnabled ?? true,
        pushNotificationsEnabled: patient.pushNotificationsEnabled ?? true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Patient Notification Preferences
 * PATCH /api/patient/notification-preferences
 * Updates email notification preference for authenticated patient
 * Access: Authenticated patients
 * Body: { emailNotificationsEnabled: boolean }
 */
export const updatePatientNotificationPreferences = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const { emailNotificationsEnabled, pushNotificationsEnabled } = req.body;

    // Validate input
    if (emailNotificationsEnabled === undefined && pushNotificationsEnabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one preference must be provided.',
      });
    }

    if (emailNotificationsEnabled !== undefined && typeof emailNotificationsEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'emailNotificationsEnabled must be a boolean value.',
      });
    }

    if (pushNotificationsEnabled !== undefined && typeof pushNotificationsEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'pushNotificationsEnabled must be a boolean value.',
      });
    }

    // Update patient notification preference
    const updatedPatient = await prisma.patient.update({
      where: { id: patientId },
      data: {
        ...(emailNotificationsEnabled !== undefined ? { emailNotificationsEnabled } : {}),
        ...(pushNotificationsEnabled !== undefined ? { pushNotificationsEnabled } : {}),
      },
      select: {
        emailNotificationsEnabled: true,
        pushNotificationsEnabled: true,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        emailNotificationsEnabled: updatedPatient.emailNotificationsEnabled,
        pushNotificationsEnabled: updatedPatient.pushNotificationsEnabled,
      },
      message: 'Notification preferences updated successfully.',
    });
  } catch (error) {
    // Handle patient not found
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Patient not found.',
      });
    }
    next(error);
  }
};

/**
 * Mark notification as read
 * PATCH /api/patient/notifications/:id/read
 * Marks a specific notification as read
 * Access: Authenticated patients
 */
export const markNotificationAsRead = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const { id } = req.params;

    // Verify notification belongs to patient
    const notification = await prisma.patientNotification.findFirst({
      where: {
        id,
        patientId,
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found.',
      });
    }

    // Mark as read
    await prisma.patientNotification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read
 * PATCH /api/patient/notifications/read-all
 * Marks all unread notifications as read for the patient
 * Access: Authenticated patients
 */
export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const patientId = req.user.id;

    // Mark all unread notifications as read
    const result = await prisma.patientNotification.updateMany({
      where: {
        patientId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: `${result.count} notification(s) marked as read.`,
      data: {
        count: result.count,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear all read notifications
 * DELETE /api/patient/notifications/clear-all
 * Deletes all read notifications for the patient
 * Access: Authenticated patients
 */
export const clearAllReadNotifications = async (req, res, next) => {
  try {
    const patientId = req.user.id;

    // Delete all read notifications
    const result = await prisma.patientNotification.deleteMany({
      where: {
        patientId,
        isRead: true,
      },
    });

    res.status(200).json({
      success: true,
      message: `${result.count} notification(s) cleared.`,
      data: {
        count: result.count,
      },
    });
  } catch (error) {
    next(error);
  }
};
