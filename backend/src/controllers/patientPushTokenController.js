import prisma from '../config/database.js';

/**
 * Register or refresh a patient device push token.
 * POST /api/patient/push-tokens
 *
 * Body: { token: string, platform?: 'ios'|'android'|'web' }
 */
export const upsertPatientPushToken = async (req, res, next) => {
  try {
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { token, platform } = req.body;

    if (!token || typeof token !== 'string' || token.trim().length < 20) {
      return res.status(400).json({ success: false, message: 'Valid token is required.' });
    }

    const normalizedPlatform =
      typeof platform === 'string' ? platform.trim().toLowerCase() : null;

    const allowedPlatforms = new Set(['ios', 'android', 'web']);
    const platformValue =
      normalizedPlatform && allowedPlatforms.has(normalizedPlatform) ? normalizedPlatform : null;

    await prisma.patientDeviceToken.upsert({
      where: {
        patientId_token: {
          patientId: patient.id,
          token: token.trim(),
        },
      },
      update: {
        isActive: true,
        lastSeenAt: new Date(),
        platform: platformValue,
      },
      create: {
        patientId: patient.id,
        token: token.trim(),
        platform: platformValue,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Push token registered.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deactivate a patient device push token.
 * DELETE /api/patient/push-tokens
 *
 * Body: { token: string }
 */
export const deactivatePatientPushToken = async (req, res, next) => {
  try {
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'token is required.' });
    }

    await prisma.patientDeviceToken.updateMany({
      where: {
        patientId: patient.id,
        token: token.trim(),
      },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    res.status(200).json({ success: true, message: 'Push token removed.' });
  } catch (error) {
    next(error);
  }
};

