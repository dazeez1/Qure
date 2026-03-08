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
 */
async function getCurrentQueue(patientId) {
  try {
    // Find active queue entry
    const queueEntry = await prisma.queueEntry.findFirst({
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
      orderBy: {
        checkInTime: 'desc',
      },
    });

    if (!queueEntry) {
      return null;
    }

    // Calculate position in queue
    const priorityOrder = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
    const currentPriorityValue = priorityOrder[queueEntry.priority] || 2;

    const entriesAhead = await prisma.queueEntry.count({
      where: {
        hospitalId: queueEntry.hospitalId,
        departmentId: queueEntry.departmentId,
        status: {
          in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
        },
        OR: [
          {
            priority: {
              in: Object.keys(priorityOrder).filter(
                (p) => priorityOrder[p] > currentPriorityValue
              ),
            },
          },
          {
            priority: queueEntry.priority,
            sequenceNumber: {
              lt: queueEntry.sequenceNumber,
            },
          },
          {
            priority: queueEntry.priority,
            sequenceNumber: queueEntry.sequenceNumber,
            checkInTime: {
              lt: queueEntry.checkInTime,
            },
          },
        ],
      },
    });

    // Calculate estimated wait time
    // Get active doctors in the department
    const activeDoctors = await prisma.user.count({
      where: {
        hospitalId: queueEntry.hospitalId,
        departmentId: queueEntry.departmentId,
        role: 'STAFF',
        staffRole: 'DOCTOR',
        isActive: true,
        isAvailable: true,
      },
    });

    // Get department's average consultation time (default 15 minutes)
    const department = await prisma.department.findUnique({
      where: { id: queueEntry.departmentId },
      select: {
        defaultConsultationTimeMinutes: true,
        avgConsultationTimeMinutes: true,
      },
    });

    const avgConsultationTime = department?.avgConsultationTimeMinutes || 
                                department?.defaultConsultationTimeMinutes || 
                                15;

    // Estimate: (entries ahead / active doctors) * avg consultation time
    let estimatedWaitMinutes = null;
    if (activeDoctors > 0) {
      estimatedWaitMinutes = Math.ceil(entriesAhead / activeDoctors) * avgConsultationTime;
    }

    return {
      ticketNumber: queueEntry.ticketNumber,
      estimatedWaitMinutes,
      positionInQueue: entriesAhead + 1,
      status: queueEntry.status,
      department: queueEntry.department,
      hospitalId: queueEntry.hospitalId, // Add hospitalId for queue status page
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
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        patientId,
        appointmentDate: {
          gte: now, // Future appointments only
        },
        status: {
          in: ['BOOKED', 'CHECKED_IN', 'MOVED_TO_QUEUE', 'IN_CONSULTATION'],
        },
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
        queueEntry: {
          where: {
            status: {
              notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'], // Only active queue entries
            },
          },
          select: {
            id: true,
            status: true,
            assignedDoctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: {
        appointmentDate: 'asc', // Earliest first
      },
      take: 10, // Limit to 10 upcoming appointments
    });

    // Filter out appointments that have active queue entries
    // If appointment has an active queue entry, it means patient has already checked in
    // and should not appear in "upcoming appointments"
    const filteredAppointments = appointments.filter((apt) => {
      // Exclude if there's an active queue entry (patient has already checked in)
      return !apt.queueEntry || apt.queueEntry.length === 0;
    });

    return filteredAppointments.map((apt) => ({
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
 * Get patient notifications (announcements)
 */
async function getPatientNotifications(patientId) {
  try {
    // Get patient's hospital from most recent appointment or active queue entry
    const recentAppointment = await prisma.appointment.findFirst({
      where: {
        patientId,
      },
      select: {
        hospitalId: true,
      },
      orderBy: {
        appointmentDate: 'desc',
      },
    });

    const activeQueueEntry = await prisma.queueEntry.findFirst({
      where: {
        patientId,
        status: {
          in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
        },
      },
      select: {
        hospitalId: true,
      },
    });

    const hospitalId = activeQueueEntry?.hospitalId || recentAppointment?.hospitalId;

    if (!hospitalId) {
      return [];
    }

    // Get recent announcements for patient audience
    const announcements = await prisma.announcement.findMany({
      where: {
        hospitalId,
        audience: {
          in: ['PATIENT', 'BOTH'],
        },
      },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5, // Limit to 5 most recent
    });

    return announcements.map((ann) => ({
      id: ann.id,
      title: ann.title,
      content: ann.content,
      createdAt: ann.createdAt,
    }));
  } catch (error) {
    console.error('Error getting patient notifications:', error);
    return [];
  }
}
