import prisma from '../config/database.js';
import { createAppointmentReminderNotification } from './patientNotification.service.js';

/**
 * Appointment Reminder Service
 * Sends reminders 24 hours and 2 hours before appointments
 */

/**
 * Check and send appointment reminders
 * Should be called periodically (e.g., every hour)
 */
export async function checkAndSendAppointmentReminders() {
  try {
    const now = new Date();
    
    // Calculate 24 hours from now
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in24HoursStart = new Date(in24Hours);
    in24HoursStart.setMinutes(0, 0, 0);
    const in24HoursEnd = new Date(in24Hours);
    in24HoursEnd.setMinutes(59, 59, 999);

    // Calculate 2 hours from now
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const in2HoursStart = new Date(in2Hours);
    in2HoursStart.setMinutes(0, 0, 0);
    const in2HoursEnd = new Date(in2Hours);
    in2HoursEnd.setMinutes(59, 59, 999);

    // Find appointments that need 24-hour reminders
    const appointments24H = await prisma.appointment.findMany({
      where: {
        status: 'BOOKED',
        appointmentDate: {
          gte: in24HoursStart,
          lte: in24HoursEnd,
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

    // Find appointments that need 2-hour reminders
    const appointments2H = await prisma.appointment.findMany({
      where: {
        status: 'BOOKED',
        appointmentDate: {
          gte: in2HoursStart,
          lte: in2HoursEnd,
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

    // Get all appointment IDs that need reminders
    const appointmentIds24H = appointments24H.map(a => a.id);
    const appointmentIds2H = appointments2H.map(a => a.id);
    const allAppointmentIds = [...new Set([...appointmentIds24H, ...appointmentIds2H])];

    // Check if reminders have already been sent for these appointments
    // We'll check the notification content to see if it mentions the appointment date
    const sentReminders = await prisma.patientNotification.findMany({
      where: {
        type: {
          in: ['APPOINTMENT_REMINDER_24H', 'APPOINTMENT_REMINDER_2H'],
        },
        createdAt: {
          gte: new Date(now.getTime() - 3 * 60 * 60 * 1000), // Check last 3 hours
        },
      },
      select: {
        patientId: true,
        type: true,
        content: true,
        createdAt: true,
      },
    });

    // Create a map of patient+type+date combinations that already received reminders
    // We'll extract the date from the content to match appointments
    const reminderMap = new Map();
    sentReminders.forEach(reminder => {
      // Extract date from content (format: "Date: March 7, 2026")
      const dateMatch = reminder.content.match(/Date: ([^\\n]+)/);
      if (dateMatch) {
        const key = `${reminder.patientId}-${reminder.type}-${dateMatch[1]}`;
        reminderMap.set(key, true);
      }
    });

    let sent24H = 0;
    let sent2H = 0;
    let failed24H = 0;
    let failed2H = 0;

    // Send 24-hour reminders
    for (const appointment of appointments24H) {
      // Format appointment date to match notification content format
      const appointmentDate = new Date(appointment.appointmentDate);
      const formattedDate = appointmentDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const reminderKey = `${appointment.patientId}-APPOINTMENT_REMINDER_24H-${formattedDate}`;
      if (reminderMap.has(reminderKey)) {
        continue; // Already sent
      }

      try {
        await createAppointmentReminderNotification({
          patientId: appointment.patientId,
          hospitalId: appointment.hospitalId,
          appointmentId: appointment.id,
          appointmentDate: appointment.appointmentDate,
          departmentName: appointment.department.name,
          doctorName: null, // No doctor assigned at appointment time
          reminderType: '24H',
        });
        sent24H++;
      } catch (error) {
        console.error(`Failed to send 24H reminder for appointment ${appointment.id}:`, error);
        failed24H++;
      }
    }

    // Send 2-hour reminders
    for (const appointment of appointments2H) {
      // Format appointment date to match notification content format
      const appointmentDate = new Date(appointment.appointmentDate);
      const formattedDate = appointmentDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const reminderKey = `${appointment.patientId}-APPOINTMENT_REMINDER_2H-${formattedDate}`;
      if (reminderMap.has(reminderKey)) {
        continue; // Already sent
      }

      try {
        await createAppointmentReminderNotification({
          patientId: appointment.patientId,
          hospitalId: appointment.hospitalId,
          appointmentId: appointment.id,
          appointmentDate: appointment.appointmentDate,
          departmentName: appointment.department.name,
          doctorName: null, // No doctor assigned at appointment time
          reminderType: '2H',
        });
        sent2H++;
      } catch (error) {
        console.error(`Failed to send 2H reminder for appointment ${appointment.id}:`, error);
        failed2H++;
      }
    }

    if (sent24H > 0 || sent2H > 0) {
      console.log(`[Appointment Reminders] Sent ${sent24H} 24H reminders, ${sent2H} 2H reminders. Failed: ${failed24H} 24H, ${failed2H} 2H`);
    }

    return {
      sent24H,
      sent2H,
      failed24H,
      failed2H,
    };
  } catch (error) {
    console.error('Error checking appointment reminders:', error);
    return {
      sent24H: 0,
      sent2H: 0,
      failed24H: 0,
      failed2H: 0,
    };
  }
}
