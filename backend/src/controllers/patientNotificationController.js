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
    const { emailNotificationsEnabled } = req.body;

    // Validate input
    if (emailNotificationsEnabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'emailNotificationsEnabled is required.',
      });
    }

    if (typeof emailNotificationsEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'emailNotificationsEnabled must be a boolean value.',
      });
    }

    // Update patient notification preference
    const updatedPatient = await prisma.patient.update({
      where: { id: patientId },
      data: {
        emailNotificationsEnabled,
      },
      select: {
        emailNotificationsEnabled: true,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        emailNotificationsEnabled: updatedPatient.emailNotificationsEnabled,
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
