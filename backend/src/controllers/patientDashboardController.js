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

    // Calculate estimated wait time based on queue position (not elapsed time)
    // Find the lowest sequenceNumber currently being served (IN_CONSULTATION)
    const currentServingEntry = await prisma.queueEntry.findFirst({
      where: {
        hospitalId: queueEntry.hospitalId,
        departmentId: queueEntry.departmentId,
        status: 'IN_CONSULTATION',
      },
      orderBy: {
        sequenceNumber: 'asc',
      },
      select: {
        sequenceNumber: true,
      },
    });

    const currentServingSequence = currentServingEntry?.sequenceNumber || 0;
    
    // Ensure position is never negative
    const position = Math.max(0, queueEntry.sequenceNumber - currentServingSequence);

    // Get active doctors with capacity in the department
    const availableDoctors = await prisma.user.findMany({
      where: {
        hospitalId: queueEntry.hospitalId,
        departmentId: queueEntry.departmentId,
        role: 'STAFF',
        staffRole: 'DOCTOR',
        isActive: true,
        isAvailable: true,
      },
      select: {
        id: true,
        currentActivePatients: true,
        maxConcurrentPatients: true,
      },
    });

    // Filter doctors with capacity
    const doctorsWithCapacity = availableDoctors.filter(
      (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
    );

    const activeDoctorsCount = doctorsWithCapacity.length;

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

    // Estimate: ceil(position / availableDoctors) * 15
    // Cap extremely large wait times (>120 mins)
    let estimatedWaitMinutes = null;
    if (activeDoctorsCount > 0 && position > 0) {
      estimatedWaitMinutes = Math.ceil(position / activeDoctorsCount) * avgConsultationTime;
      
      // Cap wait times >120 mins
      if (estimatedWaitMinutes > 120) {
        estimatedWaitMinutes = 121; // Use 121 to indicate ">120 mins" in frontend
      }
    } else if (position === 0) {
      estimatedWaitMinutes = 0; // Ready now
    }

    // Format wait time display
    let waitTimeDisplay = null;
    if (queueEntry.status === 'IN_CONSULTATION') {
      waitTimeDisplay = 'Now Serving';
    } else if (queueEntry.status === 'CALLED') {
      waitTimeDisplay = 'Next';
    } else if (estimatedWaitMinutes !== null) {
      if (estimatedWaitMinutes === 0) {
        waitTimeDisplay = 'Ready now';
      } else if (estimatedWaitMinutes > 120) {
        waitTimeDisplay = '>120 mins';
      } else {
        waitTimeDisplay = `${estimatedWaitMinutes} mins`;
      }
    } else {
      waitTimeDisplay = 'Calculating...';
    }

    return {
      ticketNumber: queueEntry.ticketNumber,
      estimatedWaitMinutes,
      waitTimeDisplay, // Formatted wait time display
      positionInQueue: position + 1, // Use position (never negative) + 1
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
