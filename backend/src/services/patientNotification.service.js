import prisma from '../config/database.js';
import { shouldSendEmailToPatient, sendAnnouncement } from './emailService.js';

/**
 * Patient Notification Service
 * Creates in-app notifications and optionally sends emails for patients
 */

/**
 * Create a patient notification
 * @param {Object} params
 * @param {string} params.patientId - Patient ID
 * @param {string} params.hospitalId - Hospital ID
 * @param {string} params.type - NotificationType enum value
 * @param {string} params.title - Notification title
 * @param {string} params.content - Notification content
 * @param {string} params.category - Category (APPOINTMENT, QUEUE, FEEDBACK, ANNOUNCEMENT)
 * @param {string} [params.priority] - Priority (default: NORMAL)
 * @param {string} [params.announcementId] - Optional announcement ID if linked
 * @param {string} [params.appointmentId] - Optional appointment ID if linked (e.g. for reminders)
 * @param {boolean} [params.sendEmail] - Whether to send email (default: true)
 * @returns {Promise<Object>} Created notification
 */
export async function createPatientNotification({
  patientId,
  hospitalId,
  type,
  title,
  content,
  category,
  priority = 'NORMAL',
  announcementId = null,
  appointmentId = null,
  sendEmail = true,
}) {
  try {
    // Create notification
    const notification = await prisma.patientNotification.create({
      data: {
        patientId,
        hospitalId,
        type,
        title,
        content,
        category,
        priority,
        announcementId,
        appointmentId,
        isRead: false,
      },
    });

    // Send email if requested
    if (sendEmail) {
      try {
        const canSendEmail = await shouldSendEmailToPatient(patientId, hospitalId);
        if (canSendEmail) {
          // Get patient email and hospital name
          const [patient, hospital] = await Promise.all([
            prisma.patient.findUnique({
              where: { id: patientId },
              select: { email: true },
            }),
            prisma.hospital.findUnique({
              where: { id: hospitalId },
              select: { name: true },
            }),
          ]);

          if (patient?.email) {
            await sendAnnouncement(
              patient.email,
              title,
              content,
              hospital?.name || 'Hospital'
            );
          }
        }
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
        // Don't fail notification creation if email fails
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating patient notification:', error);
    throw error;
  }
}

/**
 * Create appointment confirmation notification
 */
export async function createAppointmentConfirmationNotification({
  patientId,
  hospitalId,
  appointmentId,
  appointmentDate,
  departmentName,
  doctorName,
}) {
  const date = new Date(appointmentDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const title = 'Appointment Confirmed';
  const content = `Your appointment has been confirmed.\n\nDate: ${formattedDate}\nTime: ${formattedTime}\nDepartment: ${departmentName}${doctorName ? `\nDoctor: ${doctorName}` : ''}\n\nPlease arrive 15 minutes before your scheduled time.`;

  return await createPatientNotification({
    patientId,
    hospitalId,
    type: 'APPOINTMENT_CONFIRMATION',
    title,
    content,
    category: 'APPOINTMENT',
    priority: 'NORMAL',
    sendEmail: true,
  });
}

/**
 * Create appointment reminder notification (30 minutes before, sent once per appointment)
 */
export async function createAppointmentReminderNotification({
  patientId,
  hospitalId,
  appointmentId,
  appointmentDate,
  departmentName,
  doctorName,
  reminderType, // '30M' (only type used now)
}) {
  const date = new Date(appointmentDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const title = 'Appointment Reminder - 30 minutes before';
  const content = `Reminder: You have an appointment coming up in 30 minutes.\n\nDate: ${formattedDate}\nTime: ${formattedTime}\nDepartment: ${departmentName}${doctorName ? `\nDoctor: ${doctorName}` : ''}\n\nPlease arrive 15 minutes before your scheduled time.`;

  return await createPatientNotification({
    patientId,
    hospitalId,
    type: 'APPOINTMENT_REMINDER_30M',
    title,
    content,
    category: 'APPOINTMENT',
    priority: 'NORMAL',
    appointmentId,
    sendEmail: true,
  });
}

/**
 * Create appointment cancellation notification
 */
export async function createAppointmentCancellationNotification({
  patientId,
  hospitalId,
  appointmentDate,
  departmentName,
}) {
  const date = new Date(appointmentDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const title = 'Appointment Cancelled';
  const content = `Your appointment on ${formattedDate} in ${departmentName} has been cancelled.\n\nIf you need to reschedule, please book a new appointment.`;

  return await createPatientNotification({
    patientId,
    hospitalId,
    type: 'APPOINTMENT_CANCELLATION',
    title,
    content,
    category: 'APPOINTMENT',
    priority: 'NORMAL',
    sendEmail: true,
  });
}

/**
 * Create appointment reschedule notification
 */
export async function createAppointmentRescheduleNotification({
  patientId,
  hospitalId,
  oldDate,
  newDate,
  departmentName,
  doctorName,
}) {
  const oldDateObj = new Date(oldDate);
  const newDateObj = new Date(newDate);

  const formattedOldDate = oldDateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedOldTime = oldDateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const formattedNewDate = newDateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedNewTime = newDateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const title = 'Appointment Rescheduled';
  const content = `Your appointment has been rescheduled.\n\nPrevious: ${formattedOldDate} at ${formattedOldTime}\nNew: ${formattedNewDate} at ${formattedNewTime}\nDepartment: ${departmentName}${doctorName ? `\nDoctor: ${doctorName}` : ''}\n\nPlease arrive 15 minutes before your scheduled time.`;

  return await createPatientNotification({
    patientId,
    hospitalId,
    type: 'APPOINTMENT_RESCHEDULE',
    title,
    content,
    category: 'APPOINTMENT',
    priority: 'NORMAL',
    sendEmail: true,
  });
}

/**
 * Create queue status change notification
 */
export async function createQueueStatusChangeNotification({
  patientId,
  hospitalId,
  ticketNumber,
  oldStatus,
  newStatus,
  departmentName,
}) {
  const statusMessages = {
    TRIAGE: 'Your queue entry is being processed.',
    CALLED: "You've been called! Please proceed to the consultation room.",
    IN_CONSULTATION: 'Your consultation has started.',
    COMPLETED: 'Your consultation has been completed.',
  };

  const title = 'Queue Status Update';
  const content = `Your queue status has been updated.\n\nTicket: ${ticketNumber}\nDepartment: ${departmentName}\nStatus: ${statusMessages[newStatus] || newStatus}`;

  return await createPatientNotification({
    patientId,
    hospitalId,
    type: 'QUEUE_STATUS_CHANGE',
    title,
    content,
    category: 'QUEUE',
    priority: newStatus === 'CALLED' || newStatus === 'IN_CONSULTATION' ? 'HIGH' : 'NORMAL',
    sendEmail: true,
  });
}

/**
 * Create queue cancellation notification
 */
export async function createQueueCancellationNotification({
  patientId,
  hospitalId,
  ticketNumber,
  departmentName,
}) {
  const title = 'Queue Entry Cancelled';
  const content = `You have been removed from the queue.\n\nTicket: ${ticketNumber}\nDepartment: ${departmentName}\n\nIf you need to rejoin the queue, please check in again.`;

  return await createPatientNotification({
    patientId,
    hospitalId,
    type: 'QUEUE_CANCELLATION',
    title,
    content,
    category: 'QUEUE',
    priority: 'NORMAL',
    sendEmail: false, // Usually in-app only for cancellations
  });
}

/**
 * Create feedback request notification
 */
export async function createFeedbackRequestNotification({
  patientId,
  hospitalId,
  appointmentId,
  appointmentDate,
  departmentName,
}) {
  const date = new Date(appointmentDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const title = 'How was your visit?';
  const content = `We'd love to hear about your experience on ${formattedDate} in ${departmentName}.\n\nPlease take a moment to share your feedback.`;

  return await createPatientNotification({
    patientId,
    hospitalId,
    type: 'FEEDBACK_REQUEST',
    title,
    content,
    category: 'FEEDBACK',
    priority: 'LOW',
    sendEmail: false, // Usually in-app only
  });
}

