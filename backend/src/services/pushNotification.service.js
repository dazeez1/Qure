import admin from 'firebase-admin';
import prisma from '../config/database.js';

let firebaseApp = null;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawServiceAccount) {
    return null;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (error) {
    console.error('[Push] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return firebaseApp;
  } catch (error) {
    // If already initialized in a reload environment, reuse existing.
    if (admin.apps?.length) {
      firebaseApp = admin.app();
      return firebaseApp;
    }
    console.error('[Push] Failed to initialize Firebase:', error);
    return null;
  }
}

export async function sendPushToPatient({
  patientId,
  title,
  body,
  data = {},
}) {
  const app = getFirebaseApp();
  if (!app) {
    return { success: false, reason: 'firebase_not_configured' };
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { pushNotificationsEnabled: true },
  });

  if (!patient?.pushNotificationsEnabled) {
    return { success: false, reason: 'push_disabled' };
  }

  const tokens = await prisma.patientDeviceToken.findMany({
    where: {
      patientId,
      isActive: true,
    },
    select: {
      token: true,
    },
  });

  const registrationTokens = tokens.map((t) => t.token).filter(Boolean);
  if (registrationTokens.length === 0) {
    return { success: false, reason: 'no_tokens' };
  }

  const message = {
    tokens: registrationTokens,
    notification: {
      title,
      body,
    },
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)])
    ),
  };

  try {
    const result = await admin.messaging().sendEachForMulticast(message);

    // Deactivate invalid tokens.
    const tokensToDeactivate = [];
    result.responses.forEach((r, index) => {
      if (r.success) return;
      const code = r.error?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-argument')
      ) {
        tokensToDeactivate.push(registrationTokens[index]);
      }
    });

    if (tokensToDeactivate.length) {
      await prisma.patientDeviceToken.updateMany({
        where: {
          patientId,
          token: { in: tokensToDeactivate },
        },
        data: { isActive: false },
      });
    }

    return {
      success: true,
      sent: result.successCount,
      failed: result.failureCount,
    };
  } catch (error) {
    console.error('[Push] Failed to send push:', error);
    return { success: false, reason: 'send_failed' };
  }
}

