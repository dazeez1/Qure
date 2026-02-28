import { PrismaClient } from '@prisma/client';
import { sendAnnouncement } from './emailService.js';

const prisma = new PrismaClient();

/**
 * Send announcement emails to recipients
 * @param {Object} params
 * @param {string} params.hospitalId - Hospital ID
 * @param {string} params.audience - 'STAFF', 'PATIENT', or 'BOTH'
 * @param {string} params.title - Announcement title
 * @param {string} params.content - Announcement content
 * @returns {Promise<Object>} Summary with totalRecipients, successCount, failedCount
 */
export async function sendAnnouncementEmail({
  hospitalId,
  audience,
  title,
  content,
}) {
  try {
    // Validate inputs
    if (!hospitalId || !audience || !title || !content) {
      throw new Error('Missing required parameters: hospitalId, audience, title, content');
    }

    if (!['STAFF', 'PATIENT', 'BOTH'].includes(audience)) {
      throw new Error('Invalid audience. Must be STAFF, PATIENT, or BOTH');
    }

    // Fetch recipients based on audience
    let recipients = [];

    if (audience === 'STAFF' || audience === 'BOTH') {
      // Fetch staff users
      const staffUsers = await prisma.user.findMany({
        where: {
          hospitalId,
          role: { in: ['STAFF', 'ADMIN'] },
          isActive: true,
          isVerified: true,
        },
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      recipients.push(...staffUsers.map(user => ({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        type: 'STAFF',
      })));
    }

    if (audience === 'PATIENT' || audience === 'BOTH') {
      // Fetch patients who have at least one appointment in this hospital
      const patientsWithAppointments = await prisma.patient.findMany({
        where: {
          appointments: {
            some: {
              hospitalId,
            },
          },
        },
        select: {
          email: true,
          fullName: true,
        },
      });

      recipients.push(...patientsWithAppointments.map(patient => ({
        email: patient.email,
        name: patient.fullName,
        type: 'PATIENT',
      })));
    }

    // Remove duplicate emails (in case a user is both staff and patient)
    const uniqueRecipients = recipients.reduce((acc, recipient) => {
      if (!acc.find(r => r.email === recipient.email)) {
        acc.push(recipient);
      }
      return acc;
    }, []);

    const totalRecipients = uniqueRecipients.length;

    if (totalRecipients === 0) {
      console.log(`[Email Service] No recipients found for hospital ${hospitalId} with audience ${audience}`);
      return {
        totalRecipients: 0,
        successCount: 0,
        failedCount: 0,
      };
    }

    // Get hospital name for email
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    });

    const hospitalName = hospital?.name || 'Hospital';

    // Send emails using Promise.allSettled to handle failures gracefully
    const emailPromises = uniqueRecipients.map(async (recipient) => {
      try {
        const emailResult = await sendAnnouncement(
          recipient.email,
          title,
          content,
          hospitalName
        );

        if (emailResult.success) {
          console.log(`[Email Service] Email sent successfully to ${recipient.email} (${recipient.type})`);
          return { success: true, email: recipient.email, messageId: emailResult.messageId };
        } else {
          console.error(`[Email Service] Failed to send email to ${recipient.email} (${recipient.type}):`, emailResult.error);
          return { success: false, email: recipient.email, error: emailResult.error };
        }
      } catch (error) {
        console.error(`[Email Service] Failed to send email to ${recipient.email} (${recipient.type}):`, error.message);
        return { success: false, email: recipient.email, error: error.message };
      }
    });

    // Wait for all emails to be sent (success or failure)
    const results = await Promise.allSettled(emailPromises);

    // Count successes and failures
    let successCount = 0;
    let failedCount = 0;

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successCount++;
        } else {
          failedCount++;
        }
      } else {
        // Promise itself was rejected (shouldn't happen since we catch errors inside)
        failedCount++;
        console.error('[Email Service] Promise rejected:', result.reason);
      }
    });

    console.log(`[Email Service] Email sending complete. Total: ${totalRecipients}, Success: ${successCount}, Failed: ${failedCount}`);

    return {
      totalRecipients,
      successCount,
      failedCount,
    };
  } catch (error) {
    console.error('[Email Service] Error in sendAnnouncementEmail:', error);
    throw error;
  }
}
