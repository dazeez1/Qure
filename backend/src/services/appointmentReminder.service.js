import prisma from '../config/database.js';
import { createAppointmentReminderNotification } from './patientNotification.service.js';

/**
 * Appointment Reminder Service
 * Sends a single reminder 30 minutes before each appointment
 */

/**
 * Check and send appointment reminders (30 minutes before, once per appointment)
 * Should be called periodically (e.g., every 10-15 minutes to catch the 30-min window)
 */
export async function checkAndSendAppointmentReminders() {
  try {
    const now = new Date();

    // Window: appointments 20–40 minutes from now (30 min ± 10 min; catches with 15-min cron)
    const windowStart = new Date(now.getTime() + 20 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 40 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        status: 'BOOKED',
        appointmentDate: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            emailNotificationsEnabled: true,
          },
        },
        hospital: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (appointments.length === 0) {
      return { sent: 0, failed: 0 };
    }

    // Find appointments that already received a 30M reminder
    const appointmentIds = appointments.map(a => a.id);
    const existing = await prisma.patientNotification.findMany({
      where: {
        type: 'APPOINTMENT_REMINDER_30M',
        appointmentId: { in: appointmentIds },
      },
      select: { appointmentId: true },
    });
    const alreadySent = new Set(existing.map(n => n.appointmentId).filter(Boolean));

    let sent = 0;
    let failed = 0;

    for (const appointment of appointments) {
      if (alreadySent.has(appointment.id)) {
        continue;
      }

      try {
        await createAppointmentReminderNotification({
          patientId: appointment.patientId,
          hospitalId: appointment.hospitalId,
          appointmentId: appointment.id,
          appointmentDate: appointment.appointmentDate,
          departmentName: appointment.department.name,
          doctorName: null,
          reminderType: '30M',
        });
        sent++;
      } catch (error) {
        console.error(`Failed to send 30M reminder for appointment ${appointment.id}:`, error);
        failed++;
      }
    }

    if (sent > 0) {
      console.log(`[Appointment Reminders] Sent ${sent} 30-minute reminders. Failed: ${failed}`);
    }

    return { sent, failed };
  } catch (error) {
    console.error('Error checking appointment reminders:', error);
    return { sent: 0, failed: 0 };
  }
}
