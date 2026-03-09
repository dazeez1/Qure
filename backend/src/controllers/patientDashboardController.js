import prisma from '../config/database.js';

/**
 * Get patient dashboard data
 * GET /api/patient/dashboard
 * 
 * Returns:
 * - currentQueue: Active queue entry with estimated wait time (if patient is in queue)
 * - upcomingAppointments: Future appointments (BOOKED, CHECKED_IN, MOVED_TO_QUEUE, IN_CONSULTATION)
 * - notifications: Recent announcements for patient
 */
export const getPatientDashboard = async (req, res, next) => {
  try {
    const patient = req.patient;

    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Patient authentication required.',
      });
    }

    // Get all data in parallel
    const [currentQueue, upcomingAppointments, notifications] = await Promise.all([
      // 1. Get current queue entry
      getCurrentQueue(patient.id),
      
      // 2. Get upcoming appointments
      getUpcomingAppointments(patient.id),
      
      // 3. Get notifications (announcements)
      getPatientNotifications(patient.id),
    ]);

    res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        currentQueue,
        upcomingAppointments,
        notifications,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current queue entry for patient
 * When patient has multiple active queues, returns the one closest to finishing
 * (lowest estimated wait time - e.g. IN_CONSULTATION or CALLED first)
 */
async function getCurrentQueue(patientId) {
  try {
    const { getWaitTimeForEntry } = await import('../services/waitTime.service.js');

    const queueEntries = await prisma.queueEntry.findMany({
      where: {
        patientId,
        status: {
          in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
        },
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            shortCode: true,
          },
        },
      },
    });

    if (!queueEntries.length) {
      return null;
    }

    // Compute wait time for each entry and pick the one closest to finishing
    const entriesWithWait = await Promise.all(
      queueEntries.map(async (entry) => {
        const { waitMins, position, waitTimeDisplay } = await getWaitTimeForEntry({
          hospitalId: entry.hospitalId,
          departmentId: entry.departmentId,
          sequenceNumber: entry.sequenceNumber,
          status: entry.status,
        });
        return { entry, waitMins, position, waitTimeDisplay };
      })
    );

    // Sort by estimated wait ascending (closest to finishing first)
    entriesWithWait.sort((a, b) => {
      const aMins = a.waitMins ?? Infinity;
      const bMins = b.waitMins ?? Infinity;
      return aMins - bMins;
    });

    const { entry: queueEntry, waitMins, position, waitTimeDisplay } = entriesWithWait[0];

    return {
      ticketNumber: queueEntry.ticketNumber,
      estimatedWaitMinutes: waitMins,
      waitTimeDisplay,
      positionInQueue: position + 1,
      status: queueEntry.status,
      department: queueEntry.department,
      hospitalId: queueEntry.hospitalId,
    };
  } catch (error) {
    console.error('Error getting current queue:', error);
    return null;
  }
}

/**
 * Get upcoming appointments for patient
 */
async function getUpcomingAppointments(patientId) {
  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        patientId,
        status: 'BOOKED', // Only BOOKED appointments
      },
      include: {
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
            shortCode: true,
          },
        },
      },
      orderBy: {
        appointmentDate: 'asc', // Earliest first
      },
      take: 3, // Limit to 3 upcoming appointments
    });

    return appointments.map((apt) => ({
      id: apt.id,
      appointmentDate: apt.appointmentDate,
      status: apt.status,
      reason: apt.reason,
      hospital: apt.hospital,
      department: apt.department,
      assignedDoctor: null, // No doctor assigned until in consultation
    }));
  } catch (error) {
    console.error('Error getting upcoming appointments:', error);
    return [];
  }
}

/**
 * Get patient notifications
 */
async function getPatientNotifications(patientId) {
  try {
    // Get patient notifications with pagination
    const notifications = await prisma.patientNotification.findMany({
      where: {
        patientId,
      },
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        category: true,
        priority: true,
        isRead: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20, // Show 20 most recent
    });

    return notifications.map((notif) => ({
      id: notif.id,
      type: notif.type,
      title: notif.title,
      content: notif.content,
      category: notif.category,
      priority: notif.priority,
      isRead: notif.isRead,
      createdAt: notif.createdAt,
    }));
  } catch (error) {
    console.error('Error getting patient notifications:', error);
    return [];
  }
}
