import prisma from '../config/database.js';

/**
 * Get Notification Settings
 * GET /api/settings/notifications
 * Returns notification settings for logged-in user's hospital
 * Auto-creates default settings if none exist
 * All verified staff can view
 */
export const getNotificationSettings = async (req, res, next) => {
  try {
    const user = req.user;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Find existing settings
    let settings = await prisma.notificationSetting.findUnique({
      where: { hospitalId: user.hospitalId },
    });

    // Auto-create if not exists
    if (!settings) {
      settings = await prisma.notificationSetting.create({
        data: {
          hospitalId: user.hospitalId,
          patientEmailEnabled: true,
          patientEmailTemplate:
            'Hello [PatientName], this is a reminder of your appointment on [AppointmentDate] at [AppointmentTime] in [Department]. Please arrive 10 minutes early.',
          staffAnnouncementsEnabled: true,
          staffOvercapacityEnabled: true,
        },
      });
    }

    // Return clean response
    res.status(200).json({
      success: true,
      data: {
        patientEmailEnabled: settings.patientEmailEnabled,
        patientEmailTemplate: settings.patientEmailTemplate,
        staffAnnouncementsEnabled: settings.staffAnnouncementsEnabled,
        staffOvercapacityEnabled: settings.staffOvercapacityEnabled,
      },
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Update Notification Settings
 * PUT /api/settings/notifications
 * Updates notification settings for logged-in user's hospital
 * Only Primary Staff or Admin can update
 */
export const updateNotificationSettings = async (req, res, next) => {
  try {
    const user = req.user;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const {
      patientEmailEnabled,
      patientEmailTemplate,
      staffAnnouncementsEnabled,
      staffOvercapacityEnabled,
    } = req.body;

    // Find existing settings or create if not exists
    let settings = await prisma.notificationSetting.findUnique({
      where: { hospitalId: user.hospitalId },
    });

    if (!settings) {
      // Auto-create with defaults if not exists
      settings = await prisma.notificationSetting.create({
        data: {
          hospitalId: user.hospitalId,
          patientEmailEnabled: true,
          patientEmailTemplate:
            'Hello [PatientName], this is a reminder of your appointment on [AppointmentDate] at [AppointmentTime] in [Department]. Please arrive 10 minutes early.',
          staffAnnouncementsEnabled: true,
          staffOvercapacityEnabled: true,
        },
      });
    }

    // Build update data object (only update provided fields)
    const updateData = {};

    // Validate and update patientEmailEnabled if provided
    if (patientEmailEnabled !== undefined) {
      if (typeof patientEmailEnabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'patientEmailEnabled must be a boolean value.',
        });
      }
      updateData.patientEmailEnabled = patientEmailEnabled;
    }

    // Validate and update patientEmailTemplate if provided
    if (patientEmailTemplate !== undefined) {
      if (typeof patientEmailTemplate !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'patientEmailTemplate must be a string.',
        });
      }

      const trimmedTemplate = patientEmailTemplate.trim();

      // Determine if email will be enabled after this update
      const willBeEnabled = patientEmailEnabled !== undefined
        ? patientEmailEnabled
        : settings.patientEmailEnabled;

      // If email is enabled (or will be enabled), validate template
      if (willBeEnabled) {
        // Validation Rule 1: Template must not be empty
        if (trimmedTemplate.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Email template is required when email notifications are enabled.',
          });
        }

        // Validation Rule 1: Template length ≤ 1000 characters
        if (trimmedTemplate.length > 1000) {
          return res.status(400).json({
            success: false,
            message: 'Email template exceeds maximum length of 1000 characters.',
          });
        }

        // Validation Rule 2: Validate placeholders
        const allowedPlaceholders = [
          '[PatientName]',
          '[AppointmentDate]',
          '[AppointmentTime]',
          '[Department]',
          '[HospitalName]',
        ];

        // Find all placeholders in template
        const foundPlaceholders = trimmedTemplate.match(/\[[^\]]+\]/g) || [];

        // Validation Rule 2: Must contain at least ONE valid placeholder
        const hasValidPlaceholder = foundPlaceholders.some((placeholder) =>
          allowedPlaceholders.includes(placeholder)
        );

        if (!hasValidPlaceholder) {
          return res.status(400).json({
            success: false,
            message: 'Email template must contain at least one valid placeholder: [PatientName], [AppointmentDate], [AppointmentTime], [Department], or [HospitalName].',
          });
        }

        // Validation Rule 2: Check for invalid placeholders
        for (const placeholder of foundPlaceholders) {
          if (!allowedPlaceholders.includes(placeholder)) {
            return res.status(400).json({
              success: false,
              message: `Invalid placeholder detected: ${placeholder}. Allowed placeholders are: [PatientName], [AppointmentDate], [AppointmentTime], [Department], [HospitalName].`,
            });
          }
        }

        // Validation Rule 3: Basic safety check - reject if contains <script>
        if (trimmedTemplate.toLowerCase().includes('<script')) {
          return res.status(400).json({
            success: false,
            message: 'Invalid content detected in template.',
          });
        }
      }

      updateData.patientEmailTemplate = trimmedTemplate;
    }

    // If enabling email but no template provided, check existing template
    if (patientEmailEnabled !== undefined && patientEmailEnabled === true) {
      // Determine what template will be used
      const templateToUse = patientEmailTemplate !== undefined
        ? patientEmailTemplate.trim()
        : settings.patientEmailTemplate;

      if (!templateToUse || templateToUse.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Email template is required when email notifications are enabled.',
        });
      }
    }

    // Validate and update staffAnnouncementsEnabled if provided
    if (staffAnnouncementsEnabled !== undefined) {
      if (typeof staffAnnouncementsEnabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'staffAnnouncementsEnabled must be a boolean value.',
        });
      }
      updateData.staffAnnouncementsEnabled = staffAnnouncementsEnabled;
    }

    // Validate and update staffOvercapacityEnabled if provided
    if (staffOvercapacityEnabled !== undefined) {
      if (typeof staffOvercapacityEnabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'staffOvercapacityEnabled must be a boolean value.',
        });
      }
      updateData.staffOvercapacityEnabled = staffOvercapacityEnabled;
    }

    // If no updates provided, return error
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update.',
      });
    }

    // Update settings
    const updated = await prisma.notificationSetting.update({
      where: { hospitalId: user.hospitalId },
      data: updateData,
    });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Notification settings updated successfully.',
      data: {
        patientEmailEnabled: updated.patientEmailEnabled,
        patientEmailTemplate: updated.patientEmailTemplate,
        staffAnnouncementsEnabled: updated.staffAnnouncementsEnabled,
        staffOvercapacityEnabled: updated.staffOvercapacityEnabled,
      },
    });
  } catch (error) {
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Notification settings already exist for this hospital.',
      });
    }
    // Pass to error handler middleware
    next(error);
  }
};

/**
 * Send Test Notification Email
 * POST /api/settings/notifications/test-email
 * Renders email template with mock values and logs output
 * Only Primary Staff or Admin can test
 */
export const sendTestNotificationEmail = async (req, res, next) => {
  try {
    const user = req.user;

    // Ensure user has a hospital linked
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Fetch notification settings with hospital
    const settings = await prisma.notificationSetting.findUnique({
      where: { hospitalId: user.hospitalId },
      include: {
        hospital: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Notification settings not found.',
      });
    }

    // Reject if email notifications are disabled
    if (!settings.patientEmailEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Email notifications are disabled.',
      });
    }

    // Get template
    const template = settings.patientEmailTemplate || '';

    // Render template with mock values
    const renderedMessage = template
      .replace(/\[PatientName\]/g, 'John Doe')
      .replace(/\[AppointmentDate\]/g, '12 June 2026')
      .replace(/\[AppointmentTime\]/g, '10:30 AM')
      .replace(/\[Department\]/g, 'Cardiology')
      .replace(/\[HospitalName\]/g, settings.hospital.name || 'Hospital');

    // Log rendered output
    console.log('\n📧 TEST EMAIL RENDERED:');
    console.log('='.repeat(60));
    console.log(renderedMessage);
    console.log('='.repeat(60));
    console.log('');

    // Return success
    res.status(200).json({
      success: true,
      message: 'Test email rendered successfully. Check server logs.',
    });
  } catch (error) {
    // Pass to error handler middleware
    next(error);
  }
};
