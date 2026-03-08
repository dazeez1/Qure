import prisma from '../config/database.js';
import { 
  getConsultationTimeForDepartment, 
  updateDepartmentAvgConsultationTime,
  storeDailyWaitTimeMetrics,
  getHistoricalWaitTimeAnalytics,
  getHospitalHistoricalWaitTimeAnalytics
} from '../services/waitTime.service.js';
import { 
  monitorWaitTimeForEntry,
  cleanupWaitTimeCache 
} from '../services/waitTimeNotification.service.js';

/**
 * Get queue preview for public display (read-only)
 * GET /api/queue/preview
 * 
 * Query params:
 *   hospitalId: string (required)
 * 
 * Returns active queue entries for the hospital:
 * - Statuses: WAITING, TRIAGE, CALLED, IN_CONSULTATION
 * - Ordered by sequenceNumber ascending
 * - Includes: ticketNumber, masked patient name, department name, status, estimatedWait (WAITING only)
 * - Does NOT expose patient email, phone, or private data
 * - Hospital-scoped for isolation
 * 
 * estimatedWait calculation:
 *   ceil(waitingCount / activeDoctorsWithCapacity) * 15
 */
export const getQueuePreview = async (req, res, next) => {
  try {
    const { hospitalId } = req.query;

    // Validate required query parameter
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'hospitalId is required.',
      });
    }

    // Verify hospital exists
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found.',
      });
    }

    // Get all active queue entries for the hospital
    // Statuses: WAITING, TRIAGE, CALLED, IN_CONSULTATION
    const queueEntries = await prisma.queueEntry.findMany({
      where: {
        hospitalId: hospitalId,
        status: {
          in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            // Do NOT include email, phone, or other private data
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
        sequenceNumber: 'asc',
      },
    });

    // Process queue entries and calculate estimatedWait for WAITING status
    const processedEntries = await Promise.all(
      queueEntries.map(async (entry) => {
        // Mask patient name (show first name + last initial)
        let maskedPatientName = 'Unknown';
        if (entry.patient?.fullName) {
          const nameParts = entry.patient.fullName.trim().split(' ');
          if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastName = nameParts[nameParts.length - 1];
            maskedPatientName = `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
          } else if (nameParts.length === 1) {
            maskedPatientName = nameParts[0];
          }
        }

        // Calculate estimatedWait only for WAITING status
        let estimatedWait = null;
        let waitTimeDisplay = null;
        
        if (entry.status === 'IN_CONSULTATION') {
          waitTimeDisplay = 'Now Serving';
        } else if (entry.status === 'CALLED') {
          waitTimeDisplay = 'Next';
        } else if (entry.status === 'WAITING' || entry.status === 'TRIAGE') {
          // Find the lowest sequenceNumber currently being served (IN_CONSULTATION)
          const currentServingEntry = await prisma.queueEntry.findFirst({
            where: {
              hospitalId: hospitalId,
              departmentId: entry.departmentId,
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
          const position = Math.max(0, entry.sequenceNumber - currentServingSequence);

          // Count active doctors with capacity in the department
          const availableDoctors = await prisma.user.findMany({
            where: {
              hospitalId: hospitalId,
              departmentId: entry.departmentId,
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

          const activeDoctorsWithCapacity = doctorsWithCapacity.length;

          // Calculate estimatedWait: ceil(position / activeDoctorsWithCapacity) * 15
          if (activeDoctorsWithCapacity > 0 && position > 0) {
            estimatedWait = Math.ceil(position / activeDoctorsWithCapacity) * 15;
            
            // Cap extremely large wait times (>120 mins)
            if (estimatedWait > 120) {
              waitTimeDisplay = '>120 mins';
            } else {
              waitTimeDisplay = `${estimatedWait} mins`;
            }
          } else if (position === 0) {
            waitTimeDisplay = 'Ready now';
          } else {
            waitTimeDisplay = 'Calculating...';
          }
        }

        return {
          ticketNumber: entry.ticketNumber,
          patientName: maskedPatientName,
          patientId: entry.patient.id, // Include patientId for row highlighting (if authenticated)
          departmentName: entry.department.name,
          status: entry.status,
          estimatedWait: estimatedWait, // Only for WAITING, null otherwise
          waitTimeDisplay: waitTimeDisplay, // Formatted wait time display
        };
      })
    );

    // Return queue preview data
    res.status(200).json({
      success: true,
      data: processedEntries,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check in to queue (Patient only)
 * POST /api/queue/check-in
 * 
 * Body: {
 *   appointmentId: string (required)
 * }
 * 
 * Validates appointment, creates queue entry, assigns doctor, updates appointment status
 */
export const checkInToQueue = async (req, res, next) => {
  try {
    // Get patient from request (set by authenticatePatient middleware)
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const { appointmentId } = req.body;

    // Validate required field
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'appointmentId is required.',
      });
    }

    // Wrap entire logic in Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find appointment and validate
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
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
              hospitalId: true,
              status: true,
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found.');
      }

      // Validate appointment belongs to patient
      if (appointment.patientId !== patient.id) {
        throw new Error('Appointment does not belong to you.');
      }

      // Validate appointment status = BOOKED
      if (appointment.status !== 'BOOKED') {
        throw new Error(`Cannot check in. Appointment status is ${appointment.status}. Only BOOKED appointments can be checked in.`);
      }

      // Validate appointmentDate = today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const appointmentDate = new Date(appointment.appointmentDate);
      appointmentDate.setHours(0, 0, 0, 0);

      if (appointmentDate.getTime() !== today.getTime()) {
        throw new Error('Cannot check in. Appointment date must be today.');
      }

      // Validate department is ACTIVE
      if (appointment.department.status !== 'ACTIVE') {
        throw new Error('Department is not active. Cannot check in.');
      }

      // Prevent duplicate queue entry
      const existingQueueEntry = await tx.queueEntry.findFirst({
        where: {
          appointmentId: appointmentId,
          status: {
            notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
          },
        },
      });

      if (existingQueueEntry) {
        throw new Error('You already have an active queue entry for this appointment.');
      }

      // Generate department-based daily ticket number
      // Format: {SHORT_CODE}-{SEQUENCE_NUMBER} (e.g., CAR-001, CAR-002)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Count queue entries for this department today
      const todayQueueCount = await tx.queueEntry.count({
        where: {
          departmentId: appointment.departmentId,
          hospitalId: appointment.hospitalId,
          checkInTime: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      });

      const sequenceNumber = todayQueueCount + 1;
      const ticketNumber = `${appointment.department.shortCode}-${String(sequenceNumber).padStart(3, '0')}`;

      // Apply hybrid doctor assignment
      // Find available doctors: isAvailable = true, currentActivePatients < maxConcurrentPatients
      // Note: currentActivePatients is NOT incremented here - load management handled by status transition endpoint
      const availableDoctors = await tx.user.findMany({
        where: {
          hospitalId: appointment.hospitalId,
          departmentId: appointment.departmentId,
          role: 'STAFF',
          staffRole: 'DOCTOR',
          isActive: true,
          isAvailable: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          currentActivePatients: true,
          maxConcurrentPatients: true,
        },
        orderBy: {
          currentActivePatients: 'asc', // Sort ASC by currentActivePatients
        },
      });

      // Filter doctors with capacity (currentActivePatients < maxConcurrentPatients)
      const doctorsWithCapacity = availableDoctors.filter(
        (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
      );

      let assignedDoctor = null;
      let assignedDoctorName = null;

      if (doctorsWithCapacity.length > 0) {
        // Assign to doctor with lowest currentActivePatients
        assignedDoctor = doctorsWithCapacity[0];
        assignedDoctorName = `Dr. ${assignedDoctor.firstName} ${assignedDoctor.lastName}`;
        // Note: currentActivePatients increment removed - will be handled by status transition endpoint
      }

      // Create QueueEntry
      const queueEntry = await tx.queueEntry.create({
        data: {
          patientId: patient.id,
          appointmentId: appointmentId,
          hospitalId: appointment.hospitalId,
          departmentId: appointment.departmentId,
          assignedDoctorId: assignedDoctor ? assignedDoctor.id : null,
          ticketNumber: ticketNumber,
          sequenceNumber: sequenceNumber,
          status: 'WAITING',
          priority: 'NORMAL',
        },
      });

      // Auto-assign default waiting area (if available and has capacity)
      let assignedWaitingArea = null;
      // First try to find area marked as default
      let defaultWaitingArea = await tx.waitingArea.findFirst({
        where: {
          hospitalId: appointment.hospitalId,
          isActive: true,
          isDefault: true,
        },
      });

      // Fallback to first active area if no default is set (backward compatibility)
      if (!defaultWaitingArea) {
        defaultWaitingArea = await tx.waitingArea.findFirst({
          where: {
            hospitalId: appointment.hospitalId,
            isActive: true,
          },
          orderBy: {
            createdAt: 'asc', // First active area = fallback default
          },
        });
      }

      if (defaultWaitingArea) {
        // Check capacity before assigning
        const currentOccupancy = await tx.queueEntry.count({
          where: {
            waitingAreaId: defaultWaitingArea.id,
            status: {
              in: ['WAITING', 'TRIAGE', 'CALLED'],
            },
            id: { not: queueEntry.id }, // Exclude current queue entry
          },
        });

        // Only assign if capacity available
        if (currentOccupancy < defaultWaitingArea.capacity) {
          // Update queue entry with waiting area
          await tx.queueEntry.update({
            where: { id: queueEntry.id },
            data: {
              waitingAreaId: defaultWaitingArea.id,
            },
          });

          assignedWaitingArea = {
            id: defaultWaitingArea.id,
            name: defaultWaitingArea.name,
            floor: defaultWaitingArea.floor,
            facility: defaultWaitingArea.facility,
          };
        }
        // If full, skip assignment (don't reject check-in)
      }

      // Update appointment → CHECKED_IN
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CHECKED_IN',
        },
      });

      // Calculate estimated wait time (same logic as preview)
      // Get department-specific consultation time (dynamic or default)
      const avgConsultationTimeMinutes = await getConsultationTimeForDepartment(appointment.departmentId);
      let estimatedWaitMinutes = null;

      // Count active available doctors with capacity (same criteria as preview)
      // Must match hybrid doctor assignment criteria exactly:
      // - role = STAFF
      // - staffRole = DOCTOR
      // - isActive = true
      // - isAvailable = true
      // - currentActivePatients < maxConcurrentPatients
      const availableDoctorsForWait = await tx.user.findMany({
        where: {
          hospitalId: appointment.hospitalId,
          departmentId: appointment.departmentId,
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

      // Filter doctors with actual capacity (currentActivePatients < maxConcurrentPatients)
      const doctorsWithCapacityForWait = availableDoctorsForWait.filter(
        (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
      );

      const activeDoctorsCount = doctorsWithCapacityForWait.length;

      if (activeDoctorsCount > 0) {
        // Count waiting queue entries (including the one we just created)
        const waitingCount = await tx.queueEntry.count({
          where: {
            hospitalId: appointment.hospitalId,
            departmentId: appointment.departmentId,
            status: {
              in: ['WAITING', 'TRIAGE', 'CALLED'],
            },
          },
        });

        const batches = Math.ceil(waitingCount / activeDoctorsCount);
        estimatedWaitMinutes = batches * avgConsultationTimeMinutes;
      }
      // If activeDoctorsCount = 0, estimatedWaitMinutes remains null

      return {
        ticketNumber: ticketNumber,
        sequenceNumber: sequenceNumber,
        assignedDoctor: assignedDoctorName,
        estimatedWaitMinutes: estimatedWaitMinutes,
        waitingArea: assignedWaitingArea,
        queueEntryId: queueEntry.id,
        hospitalId: appointment.hospitalId,
        departmentId: appointment.departmentId,
      };
    });

    // Monitor wait time changes for all active entries in the department
    // This will trigger notifications if wait times have changed significantly
    // Do this asynchronously after the response is sent
    setImmediate(async () => {
      try {
        // Get all active queue entries in the same department
        const activeEntries = await prisma.queueEntry.findMany({
          where: {
            hospitalId: result.hospitalId,
            departmentId: result.departmentId,
            status: {
              in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
            },
          },
          select: {
            id: true,
          },
        });

        // Monitor wait time for each active entry (this will create notifications if needed)
        // Use Promise.allSettled to avoid blocking if one fails
        await Promise.allSettled(
          activeEntries.map(entry => monitorWaitTimeForEntry(entry.id))
        );
      } catch (error) {
        console.error('Error monitoring wait time changes after check-in:', error);
        // Don't throw - this is a background operation
      }
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Checked in to queue successfully.',
      data: {
        ticketNumber: result.ticketNumber,
        sequenceNumber: result.sequenceNumber,
        assignedDoctor: result.assignedDoctor,
        estimatedWaitMinutes: result.estimatedWaitMinutes,
        waitingArea: result.waitingArea, // null if no default area or full capacity
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Staff-assisted appointment check-in
 * POST /api/staff/queue/check-in
 * 
 * Allows staff (STAFF or ADMIN) to check in a patient's appointment to the queue
 * 
 * Body: {
 *   appointmentId: string (required)
 * }
 * 
 * Requirements:
 * - Authentication required (STAFF or ADMIN only)
 * - Appointment exists and belongs to user's hospital
 * - Appointment.status === 'BOOKED'
 * - appointmentDate is today
 * - No existing active queue entry for this appointment
 * 
 * Returns: {
 *   success: true,
 *   data: {
 *     ticketNumber: string,
 *     assignedDoctor: string | null,
 *     waitingArea: { id, name, floor, facility } | null
 *   }
 * }
 */
export const checkInToQueueStaff = async (req, res, next) => {
  try {
    // Get user from request (set by authenticate middleware)
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Validate user is STAFF or ADMIN
    if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { appointmentId } = req.body;

    // Validate required field
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'appointmentId is required.',
      });
    }

    // Wrap entire logic in Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find appointment and validate
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
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
              hospitalId: true,
              status: true,
            },
          },
          patient: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found.');
      }

      // Validate appointment belongs to user's hospital
      if (appointment.hospitalId !== user.hospitalId) {
        throw new Error('Appointment does not belong to your hospital.');
      }

      // Validate appointment status = BOOKED
      if (appointment.status !== 'BOOKED') {
        throw new Error(`Cannot check in. Appointment status is ${appointment.status}. Only BOOKED appointments can be checked in.`);
      }

      // Validate appointmentDate = today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const appointmentDate = new Date(appointment.appointmentDate);
      appointmentDate.setHours(0, 0, 0, 0);

      if (appointmentDate.getTime() !== today.getTime()) {
        throw new Error('Cannot check in. Appointment date must be today.');
      }

      // Validate department is ACTIVE
      if (appointment.department.status !== 'ACTIVE') {
        throw new Error('Department is not active. Cannot check in.');
      }

      // Prevent duplicate queue entry
      const existingQueueEntry = await tx.queueEntry.findFirst({
        where: {
          appointmentId: appointmentId,
          status: {
            notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
          },
        },
      });

      if (existingQueueEntry) {
        throw new Error('An active queue entry already exists for this appointment.');
      }

      // Generate department-based daily ticket number
      // Format: {SHORT_CODE}-{SEQUENCE_NUMBER} (e.g., CAR-001, CAR-002)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Count queue entries for this department today
      const todayQueueCount = await tx.queueEntry.count({
        where: {
          departmentId: appointment.departmentId,
          hospitalId: appointment.hospitalId,
          checkInTime: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      });

      const sequenceNumber = todayQueueCount + 1;
      const ticketNumber = `${appointment.department.shortCode}-${String(sequenceNumber).padStart(3, '0')}`;

      // Apply hybrid doctor assignment
      // Find available doctors: isAvailable = true, currentActivePatients < maxConcurrentPatients
      const availableDoctors = await tx.user.findMany({
        where: {
          hospitalId: appointment.hospitalId,
          departmentId: appointment.departmentId,
          role: 'STAFF',
          staffRole: 'DOCTOR',
          isActive: true,
          isAvailable: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          currentActivePatients: true,
          maxConcurrentPatients: true,
        },
        orderBy: {
          currentActivePatients: 'asc', // Sort ASC by currentActivePatients
        },
      });

      // Filter doctors with capacity (currentActivePatients < maxConcurrentPatients)
      const doctorsWithCapacity = availableDoctors.filter(
        (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
      );

      let assignedDoctor = null;
      let assignedDoctorName = null;

      if (doctorsWithCapacity.length > 0) {
        // Assign to doctor with lowest currentActivePatients
        assignedDoctor = doctorsWithCapacity[0];
        assignedDoctorName = `Dr. ${assignedDoctor.firstName} ${assignedDoctor.lastName}`;
      }

      // Create QueueEntry
      const queueEntry = await tx.queueEntry.create({
        data: {
          patientId: appointment.patientId,
          appointmentId: appointmentId,
          hospitalId: appointment.hospitalId,
          departmentId: appointment.departmentId,
          assignedDoctorId: assignedDoctor ? assignedDoctor.id : null,
          ticketNumber: ticketNumber,
          sequenceNumber: sequenceNumber,
          status: 'WAITING',
          priority: 'NORMAL',
        },
      });

      // Auto-assign default waiting area (if available and has capacity)
      let assignedWaitingArea = null;
      // First try to find area marked as default
      let defaultWaitingArea = await tx.waitingArea.findFirst({
        where: {
          hospitalId: appointment.hospitalId,
          isActive: true,
          isDefault: true,
        },
      });

      // Fallback to first active area if no default is set (backward compatibility)
      if (!defaultWaitingArea) {
        defaultWaitingArea = await tx.waitingArea.findFirst({
          where: {
            hospitalId: appointment.hospitalId,
            isActive: true,
          },
          orderBy: {
            createdAt: 'asc', // First active area = fallback default
          },
        });
      }

      if (defaultWaitingArea) {
        // Check capacity before assigning
        const currentOccupancy = await tx.queueEntry.count({
          where: {
            waitingAreaId: defaultWaitingArea.id,
            status: {
              in: ['WAITING', 'TRIAGE', 'CALLED'],
            },
            id: { not: queueEntry.id }, // Exclude current queue entry
          },
        });

        // Only assign if capacity available
        if (currentOccupancy < defaultWaitingArea.capacity) {
          // Update queue entry with waiting area
          await tx.queueEntry.update({
            where: { id: queueEntry.id },
            data: {
              waitingAreaId: defaultWaitingArea.id,
            },
          });

          assignedWaitingArea = {
            id: defaultWaitingArea.id,
            name: defaultWaitingArea.name,
            floor: defaultWaitingArea.floor,
            facility: defaultWaitingArea.facility,
          };
        }
        // If full, skip assignment (don't reject check-in)
      }

      // Update appointment → CHECKED_IN
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CHECKED_IN',
        },
      });

      return {
        ticketNumber: ticketNumber,
        assignedDoctor: assignedDoctorName,
        waitingArea: assignedWaitingArea,
        queueEntryId: queueEntry.id,
        hospitalId: appointment.hospitalId,
        departmentId: appointment.departmentId,
      };
    });

    // Monitor wait time changes for all active entries in the department
    // This will trigger notifications if wait times have changed significantly
    // Do this asynchronously after the response is sent
    setImmediate(async () => {
      try {
        // Get all active queue entries in the same department
        const activeEntries = await prisma.queueEntry.findMany({
          where: {
            hospitalId: result.hospitalId,
            departmentId: result.departmentId,
            status: {
              in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
            },
          },
          select: {
            id: true,
          },
        });

        // Monitor wait time for each active entry (this will create notifications if needed)
        // Use Promise.allSettled to avoid blocking if one fails
        await Promise.allSettled(
          activeEntries.map(entry => monitorWaitTimeForEntry(entry.id))
        );
      } catch (error) {
        console.error('Error monitoring wait time changes after staff check-in:', error);
        // Don't throw - this is a background operation
      }
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Patient checked in to queue successfully.',
      data: {
        ticketNumber: result.ticketNumber,
        assignedDoctor: result.assignedDoctor,
        waitingArea: result.waitingArea, // null if no default area or full capacity
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get queue entries for staff (Doctor or Admin)
 * GET /api/staff/queue
 * 
 * Query parameters:
 *   - departmentId: string (optional, Admin only)
 *   - status: string (optional, comma-separated or single value)
 *   - priority: string (optional)
 *   - search: string (optional, searches patient fullName or ticketNumber)
 *   - dateFrom: string (optional, ISO date for checkInTime filter)
 *   - dateTo: string (optional, ISO date for checkInTime filter)
 *   - page: number (optional, default: 1)
 *   - limit: number (optional, default: 20, max: 100)
 * 
 * Role-aware:
 *   - Doctor: Returns only assigned queue entries
 *   - Admin: Returns hospital-wide queue entries (can filter by departmentId)
 * 
 * Order: Active entries (WAITING, TRIAGE, CALLED, IN_CONSULTATION) first,
 *       sorted by priority DESC, then sequenceNumber DESC.
 *       Inactive entries (COMPLETED, CANCELLED, NO_SHOW) at bottom,
 *       sorted by checkInTime DESC.
 * 
 * Requires: STAFF role
 */
export const getStaffQueue = async (req, res, next) => {
  try {
    const user = req.user;

    // Validate user is STAFF or ADMIN
    if (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Determine if user is Admin, Primary, or Doctor
    const isAdmin = user.role === 'ADMIN';
    const isPrimary = user.isPrimary === true;
    const isDoctor = user.role === 'STAFF' && user.staffRole === 'DOCTOR';

    // Allow all verified STAFF members to access queue
    // (Verification is already checked by requireStaffVerified middleware)
    // Role-based filtering will be applied below

    // Parse query parameters
    const {
      departmentId,
      status,
      priority,
      search,
      dateFrom,
      dateTo,
      waitingAreaId,
      page = '1',
      limit = '20',
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page, 10)) || 1;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10))) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {
      hospitalId: user.hospitalId, // Always hospital-scoped
    };

    // Role-based filtering
    if (isDoctor && !isPrimary) {
      // Doctor (non-primary): only assigned entries
      where.assignedDoctorId = user.id;
    } else if (isAdmin || isPrimary) {
      // Admin or Primary: hospital-wide, can filter by department
      if (departmentId) {
        // Validate department belongs to hospital (use findFirst with both conditions)
        const department = await prisma.department.findFirst({
          where: {
            id: departmentId,
            hospitalId: user.hospitalId,
          },
          select: { id: true },
        });

        if (!department) {
          return res.status(404).json({
            success: false,
            message: 'Department not found or does not belong to your hospital.',
          });
        }

        where.departmentId = departmentId;
      }
    }

    // Status filter - validate against enum
    // Note: We'll handle status filtering after fetching to allow active/inactive splitting
    let statusFilter = null;
    if (status) {
      const statusArray = status.split(',').map(s => s.trim().toUpperCase());
      // Use enum values for validation (not raw strings)
      const validStatuses = ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
      const filteredStatuses = statusArray.filter(s => validStatuses.includes(s));
      
      if (filteredStatuses.length > 0) {
        statusFilter = filteredStatuses;
      } else if (statusArray.length > 0) {
        // If all statuses invalid, return empty result
        statusFilter = [];
      }
    } else if (isDoctor && !isPrimary) {
      // Default for Doctor (non-primary): only active statuses
      statusFilter = ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'];
    }
    
    // Apply status filter to where clause if provided
    if (statusFilter !== null) {
      if (statusFilter.length === 0) {
        where.status = { in: [] }; // Empty result
      } else {
        where.status = { in: statusFilter };
      }
    }

    // Priority filter - validate against enum
    if (priority) {
      const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
      const upperPriority = priority.toUpperCase();
      // Validate against enum values
      if (validPriorities.includes(upperPriority)) {
        where.priority = upperPriority;
      }
      // If invalid, silently ignore (don't filter by priority)
    }

    // Waiting area filter
    if (waitingAreaId) {
      // Validate waiting area belongs to hospital
      const waitingArea = await prisma.waitingArea.findFirst({
        where: {
          id: waitingAreaId,
          hospitalId: user.hospitalId,
        },
        select: { id: true },
      });

      if (!waitingArea) {
        return res.status(404).json({
          success: false,
          message: 'Waiting area not found or does not belong to your hospital.',
        });
      }

      where.waitingAreaId = waitingAreaId;
    }

    // Search filter (patient fullName or ticketNumber)
    // Handle OR clause edge case - merge if OR already exists
    if (search && search.trim()) {
      const searchTerm = search.trim();
      const searchConditions = [
        {
          patient: {
            fullName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
        {
          ticketNumber: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
      ];

      // Merge with existing OR if it exists
      if (where.OR) {
        where.OR = [...where.OR, ...searchConditions];
      } else {
        where.OR = searchConditions;
      }
    }

    // Date filter (checkInTime) - handle all combinations safely
    if (dateFrom || dateTo) {
      where.checkInTime = {};
      
      // Only dateFrom
      if (dateFrom && !dateTo) {
        const fromDate = new Date(dateFrom);
        if (!isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          where.checkInTime.gte = fromDate;
        }
      }
      
      // Only dateTo
      if (dateTo && !dateFrom) {
        const toDate = new Date(dateTo);
        if (!isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          where.checkInTime.lte = toDate;
        }
      }
      
      // Both dateFrom and dateTo
      if (dateFrom && dateTo) {
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        
        if (!isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          where.checkInTime.gte = fromDate;
        }
        
        if (!isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          where.checkInTime.lte = toDate;
        }
        
        // Validate date range
        if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate > toDate) {
          return res.status(400).json({
            success: false,
            message: 'Invalid date range. dateFrom must be before or equal to dateTo.',
          });
        }
      }
    }

    // Define active and inactive statuses
    const activeStatuses = ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'];
    const inactiveStatuses = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

    // Use transaction for findMany + count
    const result = await prisma.$transaction(async (tx) => {
      // Fetch all queue entries matching filters (without pagination for proper sorting)
      // We'll split into active/inactive after fetching
      const allQueueEntries = await tx.queueEntry.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              dateOfBirth: true,
              gender: true,
              avatarUrl: true,
            },
          },
          appointment: {
            select: {
              id: true,
              appointmentDate: true,
              reason: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              shortCode: true,
            },
          },
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedRoom: {
            select: {
              id: true,
              name: true,
            },
          },
          waitingArea: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Split entries into active and inactive groups
      const activeQueueEntries = allQueueEntries.filter((entry) =>
        activeStatuses.includes(entry.status)
      );
      const inactiveQueueEntries = allQueueEntries.filter((entry) =>
        inactiveStatuses.includes(entry.status)
      );

      // Sort active entries: priority DESC, then sequenceNumber DESC
      activeQueueEntries.sort((a, b) => {
        const priorityOrder = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
        const priorityA = priorityOrder[a.priority] || 2;
        const priorityB = priorityOrder[b.priority] || 2;
        
        if (priorityA !== priorityB) {
          return priorityB - priorityA; // DESC
        }
        
        // Same priority - sort by sequenceNumber DESC (newest first)
        return (b.sequenceNumber || 0) - (a.sequenceNumber || 0);
      });

      // Sort inactive entries: checkInTime DESC (most recent first)
      inactiveQueueEntries.sort((a, b) => {
        const timeA = new Date(a.checkInTime || 0).getTime();
        const timeB = new Date(b.checkInTime || 0).getTime();
        return timeB - timeA; // DESC
      });

      // Only return active entries (filter out COMPLETED, CANCELLED, NO_SHOW)
      // Queue view should show only active flow
      const sortedQueueEntries = activeQueueEntries;

      // Get total count (only active entries)
      const totalCount = sortedQueueEntries.length;

      // Group entries by department for efficient wait time calculation
      const entriesByDepartment = new Map();
      sortedQueueEntries.forEach(entry => {
        const key = `${entry.hospitalId}-${entry.departmentId}`;
        if (!entriesByDepartment.has(key)) {
          entriesByDepartment.set(key, []);
        }
        entriesByDepartment.get(key).push(entry);
      });

      // Calculate wait time for all entries efficiently
      const entriesWithWaitTime = await Promise.all(
        Array.from(entriesByDepartment.entries()).flatMap(async ([key, entries]) => {
          const firstEntry = entries[0];
          const hospitalId = firstEntry.hospitalId;
          const departmentId = firstEntry.departmentId;

          // Find the lowest sequenceNumber currently being served (IN_CONSULTATION) - once per department
          const currentServingEntry = await tx.queueEntry.findFirst({
            where: {
              hospitalId,
              departmentId,
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

          // Count available doctors with capacity - once per department
          const availableDoctors = await tx.user.findMany({
            where: {
              hospitalId,
              departmentId,
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

          const doctorsWithCapacity = availableDoctors.filter(
            (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
          );
          const availableDoctorsCount = doctorsWithCapacity.length;

          // Calculate wait time for each entry in this department
          return entries.map(entry => {
            let waitTimeDisplay = null;
            let waitTimeMinutes = null;

            if (entry.status === 'IN_CONSULTATION') {
              waitTimeDisplay = 'Now Serving';
            } else if (entry.status === 'CALLED') {
              waitTimeDisplay = 'Next';
            } else if (entry.status === 'WAITING' || entry.status === 'TRIAGE') {
              // Calculate wait time based on queue position
              // Ensure position is never negative
              const position = Math.max(0, entry.sequenceNumber - currentServingSequence);

              if (availableDoctorsCount > 0 && position > 0) {
                waitTimeMinutes = Math.ceil(position / availableDoctorsCount) * 15;
                
                // Cap extremely large wait times (>120 mins)
                if (waitTimeMinutes > 120) {
                  waitTimeDisplay = '>120 mins';
                } else {
                  waitTimeDisplay = `${waitTimeMinutes} mins`;
                }
              } else if (position === 0) {
                waitTimeDisplay = 'Ready now';
              } else {
                waitTimeDisplay = 'Calculating...';
              }
            }

            return {
              ...entry,
              waitTimeDisplay,
              waitTimeMinutes,
            };
          });
        })
      ).then(results => results.flat());

      // Apply pagination to merged result
      const paginatedQueueEntries = entriesWithWaitTime.slice(skip, skip + limitNum);

      return {
        queueEntries: paginatedQueueEntries,
        totalCount,
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(result.totalCount / limitNum);

    res.status(200).json({
      success: true,
      message: 'Queue entries retrieved successfully.',
      data: {
        queueEntries: result.queueEntries,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount: result.totalCount,
          totalPages: totalPages,
          hasNextPage: pageNum < totalPages,
          hasPreviousPage: pageNum > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update queue entry status
 * PATCH /api/queue/:id/status
 * 
 * Validates status transitions and manages doctor load
 * 
 * Allowed transitions:
 * - WAITING → TRIAGE, CALLED, CANCELLED
 * - TRIAGE → WAITING, CALLED, CANCELLED
 * - CALLED → IN_CONSULTATION, CANCELLED
 * - IN_CONSULTATION → COMPLETED, NO_SHOW, CANCELLED
 * 
 * Load management:
 * - IN_CONSULTATION: increment currentActivePatients
 * - COMPLETED/NO_SHOW/CANCELLED (from IN_CONSULTATION): decrement currentActivePatients
 * 
 * Requires: Assigned doctor only
 */
export const updateQueueEntryStatus = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { status, roomId, waitingAreaId } = req.body;

    // Validate user is STAFF
    if (!user || user.role !== 'STAFF') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff role required.',
      });
    }

    // Validate status is provided
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required.',
      });
    }

    // Validate status is a valid QueueStatus
    const validStatuses = ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
      });
    }

    // Validate roomId is only provided when transitioning to IN_CONSULTATION
    if (roomId && status !== 'IN_CONSULTATION') {
      return res.status(400).json({
        success: false,
        message: 'Room assignment is only allowed when transitioning to IN_CONSULTATION.',
      });
    }

    // Validate waitingAreaId can only be provided for WAITING, TRIAGE, CALLED
    const waitingAreaAllowedStatuses = ['WAITING', 'TRIAGE', 'CALLED'];
    if (waitingAreaId) {
      if (!waitingAreaAllowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Waiting area assignment is only allowed when status is WAITING, TRIAGE, or CALLED.',
        });
      }
    }

    // Reject waitingAreaId for IN_CONSULTATION or terminal states
    const terminalStates = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (waitingAreaId && (status === 'IN_CONSULTATION' || terminalStates.includes(status))) {
      return res.status(400).json({
        success: false,
        message: 'Waiting area assignment is not allowed for IN_CONSULTATION or terminal states.',
      });
    }

    // Wrap in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find queue entry
      const queueEntry = await tx.queueEntry.findUnique({
        where: { id },
        include: {
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              currentActivePatients: true,
              maxConcurrentPatients: true,
              hospitalId: true,
            },
          },
          hospital: {
            select: {
              id: true,
            },
          },
          department: {
            select: {
              id: true,
              hospitalId: true,
            },
          },
        },
      });

      if (!queueEntry) {
        throw new Error('Queue entry not found.');
      }

      // Validate hospital scoping
      if (queueEntry.hospitalId !== user.hospitalId) {
        throw new Error('Access denied. Queue entry does not belong to your hospital.');
      }

      // Validate assigned doctor
      if (!queueEntry.assignedDoctorId) {
        throw new Error('Queue entry has no assigned doctor.');
      }

      if (queueEntry.assignedDoctorId !== user.id) {
        throw new Error('Access denied. You can only update queue entries assigned to you.');
      }

      // Validate status transition
      const currentStatus = queueEntry.status;
      const newStatus = status;

      // Define allowed transitions
      const allowedTransitions = {
        WAITING: ['TRIAGE', 'CALLED', 'CANCELLED'],
        TRIAGE: ['WAITING', 'CALLED', 'CANCELLED'],
        CALLED: ['IN_CONSULTATION', 'CANCELLED'],
        IN_CONSULTATION: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
        COMPLETED: [], // Terminal state
        CANCELLED: [], // Terminal state
        NO_SHOW: [], // Terminal state
      };

      if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
        throw new Error(
          `Invalid status transition from ${currentStatus} to ${newStatus}. ` +
          `Allowed transitions: ${allowedTransitions[currentStatus]?.join(', ') || 'none'}`
        );
      }

      // Location assignment logic
      let assignedRoomId = queueEntry.assignedRoomId;
      let assignedWaitingAreaId = queueEntry.waitingAreaId;
      let assignedRoom = null;
      let assignedWaitingArea = null;

      // Room assignment logic (only when transitioning to IN_CONSULTATION)
      if (newStatus === 'IN_CONSULTATION' && roomId) {
        // Validate room exists
        const room = await tx.room.findUnique({
          where: { id: roomId },
          include: {
            department: {
              select: {
                id: true,
                hospitalId: true,
              },
            },
          },
        });

        if (!room) {
          throw new Error('Room not found.');
        }

        // Validate room is active
        if (!room.isActive) {
          throw new Error('Room is not active. Cannot assign inactive room.');
        }

        // Validate room belongs to same hospital
        if (room.hospitalId !== queueEntry.hospitalId) {
          throw new Error('Room does not belong to the same hospital.');
        }

        // Validate room belongs to same department
        if (room.departmentId !== queueEntry.departmentId) {
          throw new Error('Room does not belong to the same department.');
        }

        // Prevent double occupancy: Check if room is already occupied
        const occupiedRoom = await tx.queueEntry.findFirst({
          where: {
            assignedRoomId: roomId,
            status: 'IN_CONSULTATION',
            id: { not: id }, // Exclude current queue entry
          },
        });

        if (occupiedRoom) {
          throw new Error('Room is already occupied by another patient in consultation.');
        }

        assignedRoomId = roomId;
        assignedWaitingAreaId = null; // Clear waiting area when assigning room
        assignedRoom = room;
      }

      // Waiting area assignment logic (only for WAITING, TRIAGE, CALLED)
      if (waitingAreaAllowedStatuses.includes(newStatus)) {
        if (waitingAreaId) {
          // New waiting area assignment provided
          // Validate waiting area exists
          const waitingArea = await tx.waitingArea.findUnique({
            where: { id: waitingAreaId },
          });

          if (!waitingArea) {
            throw new Error('Waiting area not found.');
          }

          // Validate waiting area is active
          if (!waitingArea.isActive) {
            throw new Error('Waiting area is not active. Cannot assign inactive waiting area.');
          }

          // Validate waiting area belongs to same hospital
          if (waitingArea.hospitalId !== queueEntry.hospitalId) {
            throw new Error('Waiting area does not belong to the same hospital.');
          }

          // Check capacity: Count active queue entries in this waiting area
          const currentOccupancy = await tx.queueEntry.count({
            where: {
              waitingAreaId: waitingAreaId,
              status: {
                in: ['WAITING', 'TRIAGE', 'CALLED'],
              },
              id: { not: id }, // Exclude current queue entry
            },
          });

          if (currentOccupancy >= waitingArea.capacity) {
            throw new Error('Waiting area is at full capacity.');
          }

          assignedWaitingAreaId = waitingAreaId;
          assignedRoomId = null; // Clear room when assigning waiting area
          assignedWaitingArea = waitingArea;
        }
        // If no waitingAreaId provided but status allows it, preserve existing waiting area
        // (assignedWaitingAreaId already set to queueEntry.waitingAreaId above)
      }

      // Clear room assignment when transitioning from IN_CONSULTATION to terminal state
      if (currentStatus === 'IN_CONSULTATION' && 
          ['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(newStatus)) {
        assignedRoomId = null;
      }

      // Clear waiting area when transitioning to IN_CONSULTATION or terminal states
      if (newStatus === 'IN_CONSULTATION' || terminalStates.includes(newStatus)) {
        assignedWaitingAreaId = null;
      }

      // Load management logic
      const doctor = queueEntry.assignedDoctor;
      let updatedCurrentActivePatients = doctor.currentActivePatients;

      // Increment when transitioning TO IN_CONSULTATION
      if (newStatus === 'IN_CONSULTATION' && currentStatus !== 'IN_CONSULTATION') {
        // Check if doctor is at capacity
        if (doctor.currentActivePatients >= doctor.maxConcurrentPatients) {
          throw new Error('Doctor is at maximum capacity. Cannot start consultation.');
        }

        updatedCurrentActivePatients = doctor.currentActivePatients + 1;
      }

      // Decrement when transitioning FROM IN_CONSULTATION to terminal states
      if (currentStatus === 'IN_CONSULTATION' && 
          ['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(newStatus)) {
        updatedCurrentActivePatients = Math.max(0, doctor.currentActivePatients - 1);
      }

      // Build update data
      const updateData = {
        status: newStatus,
      };

      // Update room assignment if changed
      if (assignedRoomId !== queueEntry.assignedRoomId) {
        updateData.assignedRoomId = assignedRoomId;
      }

      // Update waiting area assignment if changed
      if (assignedWaitingAreaId !== queueEntry.waitingAreaId) {
        updateData.waitingAreaId = assignedWaitingAreaId;
      }

      // Update queue entry status
      const updatedQueueEntry = await tx.queueEntry.update({
        where: { id },
        data: updateData,
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              dateOfBirth: true,
              gender: true,
              avatarUrl: true,
            },
          },
          appointment: {
            select: {
              id: true,
              appointmentDate: true,
              reason: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              shortCode: true,
            },
          },
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedRoom: {
            select: {
              id: true,
              name: true,
            },
          },
          waitingArea: {
            select: {
              id: true,
              name: true,
              floor: true,
              facility: true,
            },
          },
        },
      });

      // Update appointment status to COMPLETED when queue entry is completed
      if (newStatus === 'COMPLETED' && queueEntry.appointmentId) {
        await tx.appointment.update({
          where: { id: queueEntry.appointmentId },
          data: {
            status: 'COMPLETED',
          },
        });
      }

      // Update doctor load if it changed
      if (updatedCurrentActivePatients !== doctor.currentActivePatients) {
        await tx.user.update({
          where: { id: doctor.id },
          data: {
            currentActivePatients: updatedCurrentActivePatients,
          },
        });
      }

      // Update department average consultation time when consultation completes
      // Do this asynchronously after transaction to avoid blocking
      if (newStatus === 'COMPLETED' && queueEntry.departmentId) {
        // Schedule update after transaction completes
        setImmediate(() => {
          updateDepartmentAvgConsultationTime(queueEntry.departmentId).catch(err => {
            console.error('Error updating department average consultation time:', err);
          });
        });
      }

      return {
        queueEntry: updatedQueueEntry,
        previousStatus: currentStatus,
        newStatus: newStatus,
        doctorLoadUpdated: updatedCurrentActivePatients !== doctor.currentActivePatients,
        newDoctorLoad: updatedCurrentActivePatients,
      };
    });

    res.status(200).json({
      success: true,
      message: `Queue entry status updated from ${result.previousStatus} to ${result.newStatus} successfully.`,
      data: {
        queueEntry: result.queueEntry,
        statusTransition: {
          from: result.previousStatus,
          to: result.newStatus,
        },
        doctorLoad: result.doctorLoadUpdated ? {
          updated: true,
          currentActivePatients: result.newDoctorLoad,
        } : {
          updated: false,
        },
      },
    });

    // Monitor wait time changes for all active entries in the same department
    // This will trigger notifications if wait times have changed significantly
    // Do this asynchronously after the response is sent
    setImmediate(async () => {
      try {
        // Get all active queue entries in the same department
        const activeEntries = await prisma.queueEntry.findMany({
          where: {
            hospitalId: result.queueEntry.hospitalId,
            departmentId: result.queueEntry.departmentId,
            status: {
              in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
            },
          },
          select: {
            id: true,
          },
        });

        // Monitor wait time for each active entry (this will create notifications if needed)
        // Use Promise.allSettled to avoid blocking if one fails
        await Promise.allSettled(
          activeEntries.map(entry => monitorWaitTimeForEntry(entry.id))
        );
      } catch (error) {
        console.error('Error monitoring wait time changes:', error);
        // Don't throw - this is a background operation
      }
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Bulk update queue entry status
 * PATCH /api/queue/bulk-status
 * 
 * Admin only endpoint for bulk status updates
 * 
 * Body: {
 *   queueEntryIds: string[] (required, array of queue entry IDs)
 *   status: string (required, must be NO_SHOW or CANCELLED)
 * }
 * 
 * Rules:
 * - Only allows bulk transition to: NO_SHOW, CANCELLED
 * - Validates hospital ownership for all entries
 * - Validates allowed transition per entry
 * - Decrements doctor load if status changes from IN_CONSULTATION to terminal state
 * - Wraps entire operation in transaction
 * 
 * Returns: { updatedCount: number }
 */
export const bulkUpdateQueueEntryStatus = async (req, res, next) => {
  try {
    const user = req.user;
    const { queueEntryIds, status } = req.body;

    // Validate user is ADMIN
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Validate required fields
    if (!queueEntryIds || !Array.isArray(queueEntryIds) || queueEntryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'queueEntryIds array is required and must not be empty.',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required.',
      });
    }

    // Validate status enum - only allow NO_SHOW or CANCELLED
    const allowedBulkStatuses = ['NO_SHOW', 'CANCELLED'];
    const upperStatus = status.toUpperCase();
    
    if (!allowedBulkStatuses.includes(upperStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status for bulk update. Only allowed: ${allowedBulkStatuses.join(', ')}`,
      });
    }

    // Wrap entire operation in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find all queue entries
      const queueEntries = await tx.queueEntry.findMany({
        where: {
          id: { in: queueEntryIds },
        },
        include: {
          assignedDoctor: {
            select: {
              id: true,
              currentActivePatients: true,
            },
          },
          hospital: {
            select: {
              id: true,
            },
          },
        },
      });

      // Validate all entries exist
      if (queueEntries.length !== queueEntryIds.length) {
        const foundIds = queueEntries.map(e => e.id);
        const missingIds = queueEntryIds.filter(id => !foundIds.includes(id));
        throw new Error(`Queue entries not found: ${missingIds.join(', ')}`);
      }

      // Validate hospital ownership for all entries
      const invalidHospitalEntries = queueEntries.filter(
        entry => entry.hospitalId !== user.hospitalId
      );

      if (invalidHospitalEntries.length > 0) {
        throw new Error(
          `Access denied. ${invalidHospitalEntries.length} queue entry(ies) do not belong to your hospital.`
        );
      }

      // Define allowed transitions
      const allowedTransitions = {
        WAITING: ['NO_SHOW', 'CANCELLED'],
        TRIAGE: ['NO_SHOW', 'CANCELLED'],
        CALLED: ['NO_SHOW', 'CANCELLED'],
        IN_CONSULTATION: ['NO_SHOW', 'CANCELLED'],
        COMPLETED: [], // Terminal state
        CANCELLED: [], // Terminal state
        NO_SHOW: [], // Terminal state
      };

      // Validate transitions and collect entries to update
      const entriesToUpdate = [];
      const invalidTransitions = [];

      for (const entry of queueEntries) {
        const currentStatus = entry.status;
        
        // Skip if already in terminal state
        if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED' || currentStatus === 'NO_SHOW') {
          continue;
        }

        // Validate transition
        if (!allowedTransitions[currentStatus]?.includes(upperStatus)) {
          invalidTransitions.push({
            id: entry.id,
            currentStatus,
            requestedStatus: upperStatus,
          });
          continue;
        }

        entriesToUpdate.push(entry);
      }

      // If any invalid transitions, throw error
      if (invalidTransitions.length > 0) {
        const errorDetails = invalidTransitions
          .map(t => `Entry ${t.id}: cannot transition from ${t.currentStatus} to ${t.requestedStatus}`)
          .join('; ');
        throw new Error(`Invalid status transitions: ${errorDetails}`);
      }

      // If no valid entries to update
      if (entriesToUpdate.length === 0) {
        return {
          updatedCount: 0,
        };
      }

      // Group entries by doctor for load decrement
      const doctorLoadUpdates = new Map();

      for (const entry of entriesToUpdate) {
        // If transitioning from IN_CONSULTATION, decrement doctor load
        if (entry.status === 'IN_CONSULTATION' && entry.assignedDoctorId) {
          const doctorId = entry.assignedDoctorId;
          if (!doctorLoadUpdates.has(doctorId)) {
            doctorLoadUpdates.set(doctorId, {
              doctorId,
              currentLoad: entry.assignedDoctor.currentActivePatients,
              decrementCount: 0,
            });
          }
          doctorLoadUpdates.get(doctorId).decrementCount += 1;
        }
      }

      // Update all queue entries
      const updateResult = await tx.queueEntry.updateMany({
        where: {
          id: { in: entriesToUpdate.map(e => e.id) },
        },
        data: {
          status: upperStatus,
        },
      });

      // Update doctor loads (decrement for each IN_CONSULTATION → terminal transition)
      for (const [doctorId, loadInfo] of doctorLoadUpdates.entries()) {
        const newLoad = Math.max(0, loadInfo.currentLoad - loadInfo.decrementCount);
        
        await tx.user.update({
          where: { id: doctorId },
          data: {
            currentActivePatients: newLoad,
          },
        });
      }

      return {
        updatedCount: updateResult.count,
      };
    });

    res.status(200).json({
      success: true,
      message: `Bulk status update completed. ${result.updatedCount} queue entry(ies) updated to ${upperStatus}.`,
      data: {
        updatedCount: result.updatedCount,
        status: upperStatus,
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Bulk reassign queue entries to a new doctor
 * PATCH /api/queue/reassign
 * 
 * Admin only endpoint for bulk reassignment
 * 
 * Body: {
 *   queueEntryIds: string[] (required, array of queue entry IDs)
 *   newDoctorId: string (required, ID of the new assigned doctor)
 * }
 * 
 * Rules:
 * - Validates hospital ownership for all entries
 * - Rejects terminal states (COMPLETED, CANCELLED, NO_SHOW)
 * - Validates new doctor: STAFF, DOCTOR, isActive, isAvailable, hospital match
 * - For IN_CONSULTATION entries: decrement old doctor, increment new doctor
 * - Enforces capacity check for new doctor
 * - Rejects if new doctor is same as current
 * - Wraps entire operation in transaction
 * 
 * Returns: { updatedCount: number, newDoctorName: string }
 */
/**
 * Get patient queue status
 * GET /api/patient/queue-status
 * 
 * Patient authentication only
 * 
 * Finds active queue entry for patient (WAITING, TRIAGE, CALLED, IN_CONSULTATION)
 * If none → returns success with data: null
 * 
 * Calculates:
 * - positionInQueue: Position in queue based on priority and sequenceNumber
 * - estimatedWaitMinutes: Same formula as preview endpoint
 * 
 * Includes: department, assignedDoctor, assignedRoom
 * 
 * Hospital scoped
 * Read-only (wrapped in transaction)
 */
export const getPatientQueueStatus = async (req, res, next) => {
  try {
    const patient = req.patient;

    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Patient authentication required.',
      });
    }

    // Wrap read operations in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find active queue entry for patient
      const queueEntry = await tx.queueEntry.findFirst({
        where: {
          patientId: patient.id,
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
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedRoom: {
            select: {
              id: true,
              name: true,
            },
          },
          hospital: {
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          checkInTime: 'desc', // Get most recent active entry
        },
      });

      // If no active queue entry, return null
      if (!queueEntry) {
        return {
          queueEntry: null,
          positionInQueue: null,
          estimatedWaitMinutes: null,
        };
      }

      // Calculate positionInQueue
      // Count entries that come before this patient in queue order
      // Queue order: priority DESC, sequenceNumber ASC
      // So count entries with:
      // - Higher priority (priority > current priority)
      // - OR same priority AND sequenceNumber < current sequenceNumber
      // - OR same priority AND same sequenceNumber AND checkInTime < current checkInTime
      const priorityOrder = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
      const currentPriorityValue = priorityOrder[queueEntry.priority] || 2;

      const entriesAhead = await tx.queueEntry.count({
        where: {
          hospitalId: queueEntry.hospitalId,
          departmentId: queueEntry.departmentId,
          status: {
            in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
          },
          OR: [
            // Higher priority
            {
              priority: {
                in: Object.keys(priorityOrder).filter(
                  (p) => priorityOrder[p] > currentPriorityValue
                ),
              },
            },
            // Same priority, earlier sequenceNumber
            {
              priority: queueEntry.priority,
              sequenceNumber: {
                lt: queueEntry.sequenceNumber,
              },
            },
            // Same priority, same sequenceNumber, earlier checkInTime
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

      const positionInQueue = entriesAhead + 1; // Position is 1-indexed

      // Calculate estimatedWaitMinutes (same formula as preview)
      // Get department-specific consultation time (dynamic or default)
      const avgConsultationTimeMinutes = await getConsultationTimeForDepartment(queueEntry.departmentId);

      // Count active available doctors with capacity (same logic as preview)
      const availableDoctors = await tx.user.findMany({
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

      // Filter doctors with actual capacity
      const doctorsWithCapacity = availableDoctors.filter(
        (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
      );

      const activeDoctors = doctorsWithCapacity.length;

      // Calculate estimated wait time
      // Formula: ceil(waitingCount / activeDoctors) × avgConsultationTime
      // If activeDoctors = 0 → estimatedWaitMinutes = null
      let estimatedWaitMinutes = null;

      if (activeDoctors > 0) {
        // Count waiting queue entries (WAITING, TRIAGE, CALLED)
        const waitingCount = await tx.queueEntry.count({
          where: {
            hospitalId: queueEntry.hospitalId,
            departmentId: queueEntry.departmentId,
            status: {
              in: ['WAITING', 'TRIAGE', 'CALLED'],
            },
          },
        });

        const batches = Math.ceil(waitingCount / activeDoctors);
        estimatedWaitMinutes = batches * avgConsultationTimeMinutes;
        
        // Calculate confidence interval for patient queue status
        const varianceFactor = Math.max(0.15, Math.min(0.30, (waitingCount / Math.max(activeDoctors, 1)) * 0.05));
        const confidenceInterval = estimatedWaitMinutes * varianceFactor;
        const minWaitMinutes = Math.max(0, Math.round(estimatedWaitMinutes - confidenceInterval));
        const maxWaitMinutes = Math.round(estimatedWaitMinutes + confidenceInterval);

      return {
        queueEntry: queueEntry,
        positionInQueue: positionInQueue,
        estimatedWaitMinutes: estimatedWaitMinutes,
          minWaitMinutes: minWaitMinutes,
          maxWaitMinutes: maxWaitMinutes,
        };
      }
      
      return {
        queueEntry: queueEntry,
        positionInQueue: positionInQueue,
        estimatedWaitMinutes: null,
        minWaitMinutes: null,
        maxWaitMinutes: null,
      };
    });

    // Monitor wait time changes for patient's queue entry
    // This will create notifications if significant changes are detected
    // Do this asynchronously after the response is sent
    if (result.queueEntry !== null) {
      setImmediate(async () => {
        try {
          await monitorWaitTimeForEntry(result.queueEntry.id);
        } catch (error) {
          console.error('Error monitoring wait time for patient queue entry:', error);
          // Don't throw - this is a background operation
        }
      });
    }

    // Return response
    if (result.queueEntry === null) {
      res.status(200).json({
        success: true,
        message: 'No active queue entry found.',
        data: null,
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'Queue status retrieved successfully.',
        data: {
          queueEntry: {
            id: result.queueEntry.id,
            ticketNumber: result.queueEntry.ticketNumber,
            sequenceNumber: result.queueEntry.sequenceNumber,
            status: result.queueEntry.status,
            priority: result.queueEntry.priority,
            checkInTime: result.queueEntry.checkInTime,
            department: result.queueEntry.department,
            assignedDoctor: result.queueEntry.assignedDoctor,
            assignedRoom: result.queueEntry.assignedRoom,
          },
          positionInQueue: result.positionInQueue,
          estimatedWaitMinutes: result.estimatedWaitMinutes,
          minWaitMinutes: result.minWaitMinutes,
          maxWaitMinutes: result.maxWaitMinutes,
        },
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel patient's queue entry
 * PATCH /api/patient/queue/:id/cancel
 * 
 * Patient-only endpoint
 * 
 * Restrictions:
 * - Allow: WAITING, TRIAGE, CALLED
 * - Block: IN_CONSULTATION
 * - Keep appointment as BOOKED if linked
 * - Handle doctor load appropriately
 * - Update appointment status appropriately
 */
export const cancelPatientQueueEntry = async (req, res, next) => {
  try {
    const patient = req.patient;
    const { id } = req.params;

    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Patient authentication required.',
      });
    }

    // Wrap in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find queue entry
      const queueEntry = await tx.queueEntry.findUnique({
        where: { id },
        include: {
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              currentActivePatients: true,
              maxConcurrentPatients: true,
            },
          },
          appointment: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (!queueEntry) {
        throw new Error('Queue entry not found.');
      }

      // Verify queue entry belongs to patient
      if (queueEntry.patientId !== patient.id) {
        throw new Error('Access denied. You can only cancel your own queue entries.');
      }

      // Validate status - block IN_CONSULTATION
      if (queueEntry.status === 'IN_CONSULTATION') {
        throw new Error('Cannot cancel queue entry while in consultation. Please contact staff.');
      }

      // Validate status - allow only WAITING, TRIAGE, CALLED
      const allowedStatuses = ['WAITING', 'TRIAGE', 'CALLED'];
      if (!allowedStatuses.includes(queueEntry.status)) {
        throw new Error(
          `Cannot cancel queue entry with status ${queueEntry.status}. ` +
          `Only queue entries with status WAITING, TRIAGE, or CALLED can be cancelled.`
        );
      }

      // Handle doctor load - decrement if status is IN_CONSULTATION (but we block that above)
      // However, we still need to handle the case where doctor might have been assigned
      // but status hasn't transitioned to IN_CONSULTATION yet
      let doctorLoadUpdated = false;
      let newDoctorLoad = null;

      // If doctor was assigned and status was IN_CONSULTATION, decrement load
      // But we block IN_CONSULTATION above, so this shouldn't happen
      // Still, handle it defensively
      if (queueEntry.assignedDoctorId && queueEntry.status === 'IN_CONSULTATION') {
        const doctor = queueEntry.assignedDoctor;
        if (doctor && doctor.currentActivePatients > 0) {
          newDoctorLoad = Math.max(0, doctor.currentActivePatients - 1);
          await tx.user.update({
            where: { id: doctor.id },
            data: {
              currentActivePatients: newDoctorLoad,
            },
          });
          doctorLoadUpdated = true;
        }
      }

      // Update queue entry status to CANCELLED
      const updatedQueueEntry = await tx.queueEntry.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          assignedRoomId: null, // Clear room assignment
          waitingAreaId: null, // Clear waiting area assignment
        },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              shortCode: true,
            },
          },
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Update appointment status - keep as BOOKED if linked
      let appointmentUpdated = false;
      if (queueEntry.appointmentId) {
        // Keep appointment as BOOKED (don't change status)
        // The appointment remains valid for potential rescheduling
        // Only update if it was in a state that should be reverted
        if (queueEntry.appointment.status === 'CHECKED_IN' || 
            queueEntry.appointment.status === 'MOVED_TO_QUEUE') {
          await tx.appointment.update({
            where: { id: queueEntry.appointmentId },
            data: {
              status: 'BOOKED',
            },
          });
          appointmentUpdated = true;
        }
      }

      return {
        queueEntry: updatedQueueEntry,
        previousStatus: queueEntry.status,
        appointmentUpdated,
        doctorLoadUpdated,
        newDoctorLoad,
      };
    });

    res.status(200).json({
      success: true,
      message: 'Queue entry cancelled successfully.',
      data: {
        queueEntry: result.queueEntry,
        previousStatus: result.previousStatus,
        appointmentUpdated: result.appointmentUpdated,
        doctorLoadUpdated: result.doctorLoadUpdated,
        newDoctorLoad: result.newDoctorLoad,
      },
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('Cannot cancel')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};

export const bulkReassignQueueEntries = async (req, res, next) => {
  try {
    const user = req.user;
    const { queueEntryIds, newDoctorId } = req.body;

    // Validate user is ADMIN
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Validate required fields
    if (!queueEntryIds || !Array.isArray(queueEntryIds) || queueEntryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'queueEntryIds array is required and must not be empty.',
      });
    }

    if (!newDoctorId) {
      return res.status(400).json({
        success: false,
        message: 'newDoctorId is required.',
      });
    }

    // Wrap entire operation in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Validate new doctor
      const newDoctor = await tx.user.findUnique({
        where: { id: newDoctorId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          staffRole: true,
          isActive: true,
          isAvailable: true,
          hospitalId: true,
          currentActivePatients: true,
          maxConcurrentPatients: true,
        },
      });

      if (!newDoctor) {
        throw new Error('New doctor not found.');
      }

      // Validate new doctor: role STAFF, staffRole DOCTOR, isActive true, isAvailable true, hospital match
      if (newDoctor.role !== 'STAFF') {
        throw new Error('New doctor must have STAFF role.');
      }

      if (newDoctor.staffRole !== 'DOCTOR') {
        throw new Error('New doctor must have DOCTOR staffRole.');
      }

      if (!newDoctor.isActive) {
        throw new Error('New doctor must be active.');
      }

      if (!newDoctor.isAvailable) {
        throw new Error('New doctor must be available.');
      }

      if (newDoctor.hospitalId !== user.hospitalId) {
        throw new Error('New doctor does not belong to your hospital.');
      }

      // Find all queue entries
      const queueEntries = await tx.queueEntry.findMany({
        where: {
          id: { in: queueEntryIds },
        },
        include: {
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              currentActivePatients: true,
            },
          },
          hospital: {
            select: {
              id: true,
            },
          },
        },
      });

      // Validate all entries exist
      if (queueEntries.length !== queueEntryIds.length) {
        const foundIds = queueEntries.map(e => e.id);
        const missingIds = queueEntryIds.filter(id => !foundIds.includes(id));
        throw new Error(`Queue entries not found: ${missingIds.join(', ')}`);
      }

      // Validate hospital ownership for all entries
      const invalidHospitalEntries = queueEntries.filter(
        entry => entry.hospitalId !== user.hospitalId
      );

      if (invalidHospitalEntries.length > 0) {
        throw new Error(
          `Access denied. ${invalidHospitalEntries.length} queue entry(ies) do not belong to your hospital.`
        );
      }

      // Reject terminal states
      const terminalStates = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
      const terminalEntries = queueEntries.filter(
        entry => terminalStates.includes(entry.status)
      );

      if (terminalEntries.length > 0) {
        throw new Error(
          `Cannot reassign queue entries in terminal states: ${terminalEntries.map(e => e.id).join(', ')}`
        );
      }

      // Filter entries that need reassignment (exclude if already assigned to new doctor)
      const entriesToReassign = queueEntries.filter(
        entry => entry.assignedDoctorId !== newDoctorId
      );

      if (entriesToReassign.length === 0) {
        throw new Error('All queue entries are already assigned to the specified doctor.');
      }

      // Count IN_CONSULTATION entries that will be reassigned
      const inConsultationEntries = entriesToReassign.filter(
        entry => entry.status === 'IN_CONSULTATION'
      );

      // Check new doctor capacity
      // Formula: currentActivePatients + inConsultationCount <= maxConcurrentPatients
      const currentLoad = newDoctor.currentActivePatients;
      const newLoadAfterReassign = currentLoad + inConsultationEntries.length;

      if (newLoadAfterReassign > newDoctor.maxConcurrentPatients) {
        throw new Error(
          `New doctor capacity exceeded. Current load: ${currentLoad}/${newDoctor.maxConcurrentPatients}, ` +
          `would become: ${newLoadAfterReassign}/${newDoctor.maxConcurrentPatients} after reassigning ${inConsultationEntries.length} IN_CONSULTATION entry(ies).`
        );
      }

      // Group old doctors by ID for load decrement
      const oldDoctorLoadUpdates = new Map();

      for (const entry of entriesToReassign) {
        // If entry is IN_CONSULTATION and has an assigned doctor, decrement old doctor load
        if (entry.status === 'IN_CONSULTATION' && entry.assignedDoctorId) {
          const oldDoctorId = entry.assignedDoctorId;
          if (!oldDoctorLoadUpdates.has(oldDoctorId)) {
            oldDoctorLoadUpdates.set(oldDoctorId, {
              doctorId: oldDoctorId,
              currentLoad: entry.assignedDoctor.currentActivePatients,
              decrementCount: 0,
            });
          }
          oldDoctorLoadUpdates.get(oldDoctorId).decrementCount += 1;
        }
      }

      // Update all queue entries
      const updateResult = await tx.queueEntry.updateMany({
        where: {
          id: { in: entriesToReassign.map(e => e.id) },
        },
        data: {
          assignedDoctorId: newDoctorId,
        },
      });

      // Decrement old doctor loads (for IN_CONSULTATION entries)
      // Validate that current load is sufficient to prevent negative values
      for (const [oldDoctorId, loadInfo] of oldDoctorLoadUpdates.entries()) {
        // Validate that current load is sufficient (for better error reporting)
        if (loadInfo.currentLoad < loadInfo.decrementCount) {
          throw new Error(
            `Data inconsistency detected: Doctor ${oldDoctorId} has load ${loadInfo.currentLoad} but needs to decrement ${loadInfo.decrementCount}.`
          );
        }
        
        // Use Math.max(0, ...) as additional safety net to prevent negative load
        const newLoad = Math.max(0, loadInfo.currentLoad - loadInfo.decrementCount);
        
        await tx.user.update({
          where: { id: oldDoctorId },
          data: {
            currentActivePatients: newLoad,
          },
        });
      }

      // Increment new doctor load (for IN_CONSULTATION entries)
      if (inConsultationEntries.length > 0) {
        const newLoad = currentLoad + inConsultationEntries.length;
        
        await tx.user.update({
          where: { id: newDoctorId },
          data: {
            currentActivePatients: newLoad,
          },
        });
      }

      return {
        updatedCount: updateResult.count,
        newDoctorName: `Dr. ${newDoctor.firstName} ${newDoctor.lastName}`,
      };
    });

    res.status(200).json({
      success: true,
      message: `Bulk reassignment completed. ${result.updatedCount} queue entry(ies) reassigned to ${result.newDoctorName}.`,
      data: {
        updatedCount: result.updatedCount,
        newDoctorName: result.newDoctorName,
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Bulk assign queue entries to waiting area
 * PATCH /api/queue/bulk-waiting-area
 * 
 * Admin or Primary Staff only endpoint for bulk waiting area assignment
 * 
 * Body: {
 *   queueEntryIds: string[] (required, array of queue entry IDs)
 *   waitingAreaId: string (required, waiting area ID)
 * }
 * 
 * Rules:
 * - Only allows assignment for entries in WAITING, TRIAGE, CALLED status
 * - Validates hospital ownership for all entries
 * - Validates waiting area exists, is active, and belongs to hospital
 * - Checks capacity before assignment (excludes entries being moved)
 * - Clears room assignment when assigning waiting area
 * - Wraps entire operation in transaction
 * 
 * Returns: { updatedCount: number, waitingAreaName: string }
 */
export const bulkAssignWaitingArea = async (req, res, next) => {
  try {
    const user = req.user;
    const { queueEntryIds, waitingAreaId } = req.body;

    // Validate user is ADMIN or Primary
    const isAdmin = user && user.role === 'ADMIN';
    const isPrimary = user && user.isPrimary === true;
    
    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role or Primary staff required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Validate required fields
    if (!queueEntryIds || !Array.isArray(queueEntryIds) || queueEntryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'queueEntryIds array is required and must not be empty.',
      });
    }

    if (!waitingAreaId) {
      return res.status(400).json({
        success: false,
        message: 'waitingAreaId is required.',
      });
    }

    // Wrap entire operation in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Validate waiting area
      const waitingArea = await tx.waitingArea.findUnique({
        where: { id: waitingAreaId },
      });

      if (!waitingArea) {
        throw new Error('Waiting area not found.');
      }

      // Validate waiting area is active
      if (!waitingArea.isActive) {
        throw new Error('Waiting area is not active. Cannot assign inactive waiting area.');
      }

      // Validate waiting area belongs to same hospital
      if (waitingArea.hospitalId !== user.hospitalId) {
        throw new Error('Waiting area does not belong to your hospital.');
      }

      // Find all queue entries
      const queueEntries = await tx.queueEntry.findMany({
        where: {
          id: { in: queueEntryIds },
        },
        include: {
          hospital: {
            select: {
              id: true,
            },
          },
        },
      });

      // Validate all entries exist
      if (queueEntries.length !== queueEntryIds.length) {
        const foundIds = queueEntries.map(e => e.id);
        const missingIds = queueEntryIds.filter(id => !foundIds.includes(id));
        throw new Error(`Queue entries not found: ${missingIds.join(', ')}`);
      }

      // Validate hospital ownership for all entries
      const invalidHospitalEntries = queueEntries.filter(
        entry => entry.hospitalId !== user.hospitalId
      );

      if (invalidHospitalEntries.length > 0) {
        throw new Error(
          `Access denied. ${invalidHospitalEntries.length} queue entry(ies) do not belong to your hospital.`
        );
      }

      // Only allow assignment for WAITING, TRIAGE, CALLED statuses
      const allowedStatuses = ['WAITING', 'TRIAGE', 'CALLED'];
      const invalidStatusEntries = queueEntries.filter(
        entry => !allowedStatuses.includes(entry.status)
      );

      if (invalidStatusEntries.length > 0) {
        const invalidStatuses = invalidStatusEntries.map(e => `${e.id} (${e.status})`).join(', ');
        throw new Error(
          `Cannot assign waiting area to entries in invalid statuses. Invalid entries: ${invalidStatuses}`
        );
      }

      // Filter entries that need assignment (exclude if already assigned to this waiting area)
      const entriesToAssign = queueEntries.filter(
        entry => entry.waitingAreaId !== waitingAreaId
      );

      if (entriesToAssign.length === 0) {
        throw new Error('All queue entries are already assigned to this waiting area.');
      }

      // Check capacity: Count current occupancy + entries being moved
      const currentOccupancy = await tx.queueEntry.count({
        where: {
          waitingAreaId: waitingAreaId,
          status: {
            in: ['WAITING', 'TRIAGE', 'CALLED'],
          },
          id: { notIn: entriesToAssign.map(e => e.id) }, // Exclude entries being moved
        },
      });

      const newOccupancy = currentOccupancy + entriesToAssign.length;

      if (newOccupancy > waitingArea.capacity) {
        throw new Error(
          `Waiting area capacity exceeded. Current: ${currentOccupancy}/${waitingArea.capacity}, ` +
          `would become: ${newOccupancy}/${waitingArea.capacity} after assigning ${entriesToAssign.length} entry(ies).`
        );
      }

      // Update all queue entries (assign waiting area and clear room)
      const updateResult = await tx.queueEntry.updateMany({
        where: {
          id: { in: entriesToAssign.map(e => e.id) },
        },
        data: {
          waitingAreaId: waitingAreaId,
          assignedRoomId: null, // Clear room when assigning waiting area
        },
      });

      return {
        updatedCount: updateResult.count,
        waitingAreaName: waitingArea.name,
      };
    });

    res.status(200).json({
      success: true,
      message: `Bulk waiting area assignment completed. ${result.updatedCount} queue entry(ies) assigned to ${result.waitingAreaName}.`,
      data: {
        updatedCount: result.updatedCount,
        waitingAreaName: result.waitingAreaName,
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get dashboard summary
 * GET /api/staff/dashboard-summary
 * 
 * Access:
 * - ADMIN: Full hospital-wide metrics
 * - Primary Staff: Full hospital-wide metrics
 * - DOCTOR: Only their assigned queue entries
 * 
 * Returns:
 * - Queue counts by status (WAITING, TRIAGE, CALLED, IN_CONSULTATION)
 * - Waiting area occupancy
 * - Room occupancy status
 * - Doctor load summary (active count, overloaded count)
 * - Today stats (completed, noShows, averageWaitTimeToday)
 */
export const getDashboardSummary = async (req, res, next) => {
  try {
    const user = req.user;
    const hospitalId = user.hospitalId;

    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required.',
      });
    }

    // Determine access scope
    const isAdmin = user.role === 'ADMIN';
    const isPrimary = user.isPrimary === true;
    const isDoctor = user.role === 'STAFF' && user.staffRole === 'DOCTOR';
    const isDoctorScoped = isDoctor && !isPrimary;

    // Build queue entry filter based on role
    const queueEntryFilter = {
      hospitalId: hospitalId,
      ...(isDoctorScoped && { assignedDoctorId: user.id }),
    };

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Execute all queries in a single transaction for atomic read
    const summary = await prisma.$transaction(async (tx) => {
      // 1. Queue counts by status
      const queueCounts = await tx.queueEntry.groupBy({
        by: ['status'],
        where: {
          ...queueEntryFilter,
          status: {
            in: ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'],
          },
        },
        _count: {
          id: true,
        },
      });

      // Convert to object format
      const queue = {
        waiting: 0,
        triage: 0,
        called: 0,
        inConsultation: 0,
      };

      queueCounts.forEach((item) => {
        const status = item.status.toLowerCase();
        if (status === 'waiting') queue.waiting = item._count.id;
        else if (status === 'triage') queue.triage = item._count.id;
        else if (status === 'called') queue.called = item._count.id;
        else if (status === 'in_consultation') queue.inConsultation = item._count.id;
      });

      // 2. Waiting area occupancy
      const waitingAreas = await tx.waitingArea.findMany({
        where: {
          hospitalId: hospitalId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          capacity: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      // Get occupancy for each waiting area
      const waitingAreasWithOccupancy = await Promise.all(
        waitingAreas.map(async (area) => {
          const occupancy = await tx.queueEntry.count({
            where: {
              waitingAreaId: area.id,
              status: {
                in: ['WAITING', 'TRIAGE', 'CALLED'],
              },
            },
          });

          return {
            id: area.id,
            name: area.name,
            capacity: area.capacity,
            currentOccupancy: occupancy,
          };
        })
      );

      // 3. Room occupancy
      const rooms = await tx.room.findMany({
        where: {
          hospitalId: hospitalId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      // Get occupancy status for each room
      const roomsWithOccupancy = await Promise.all(
        rooms.map(async (room) => {
          const occupiedEntry = await tx.queueEntry.findFirst({
            where: {
              assignedRoomId: room.id,
              status: 'IN_CONSULTATION',
            },
            select: {
              id: true,
            },
          });

          return {
            id: room.id,
            name: room.name,
            occupied: !!occupiedEntry,
          };
        })
      );

      // 4. Doctor load summary
      // Count active doctors
      const activeDoctors = await tx.user.count({
        where: {
          hospitalId: hospitalId,
          role: 'STAFF',
          staffRole: 'DOCTOR',
          isActive: true,
        },
      });

      // Count overloaded doctors
      // Note: Prisma doesn't support comparing fields directly in count,
      // so we need to fetch and filter in memory
      const allDoctors = await tx.user.findMany({
        where: {
          hospitalId: hospitalId,
          role: 'STAFF',
          staffRole: 'DOCTOR',
          isActive: true,
        },
        select: {
          currentActivePatients: true,
          maxConcurrentPatients: true,
        },
      });

      const overloadedDoctors = allDoctors.filter(
        (doctor) => doctor.currentActivePatients >= doctor.maxConcurrentPatients
      ).length;

      // 5. Today stats
      const todayCompleted = await tx.queueEntry.count({
        where: {
          ...queueEntryFilter,
          status: 'COMPLETED',
          checkInTime: {
            gte: today,
            lte: todayEnd,
          },
        },
      });

      const todayNoShows = await tx.queueEntry.count({
        where: {
          ...queueEntryFilter,
          status: 'NO_SHOW',
          checkInTime: {
            gte: today,
            lte: todayEnd,
          },
        },
      });

      // 6. Calculate average wait time for completed entries today
      const completedEntries = await tx.queueEntry.findMany({
        where: {
          ...queueEntryFilter,
          status: 'COMPLETED',
          checkInTime: {
            gte: today,
            lte: todayEnd,
          },
        },
        select: {
          checkInTime: true,
          updatedAt: true,
        },
      });

      let averageWaitTimeToday = null;
      if (completedEntries.length > 0) {
        const waitTimes = completedEntries.map((entry) => {
          const checkIn = new Date(entry.checkInTime);
          const completed = new Date(entry.updatedAt);
          const diffMs = completed.getTime() - checkIn.getTime();
          return diffMs / (1000 * 60); // Convert to minutes
        });

        const totalWaitTime = waitTimes.reduce((sum, time) => sum + time, 0);
        averageWaitTimeToday = Math.round((totalWaitTime / waitTimes.length) * 10) / 10; // Round to 1 decimal place
      }

      return {
        queue,
        waitingAreas: waitingAreasWithOccupancy,
        rooms: roomsWithOccupancy,
        doctors: {
          active: activeDoctors,
          overloaded: overloadedDoctors,
        },
        today: {
          completed: todayCompleted,
          noShows: todayNoShows,
          averageWaitTimeToday: averageWaitTimeToday,
        },
      };
    });

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available doctors for queue reassignment
 * GET /api/queue/doctors
 * 
 * Returns list of available doctors in the hospital for reassignment
 * 
 * Rules:
 * - Only ADMIN or Primary Staff allowed
 * - Returns doctors: STAFF, DOCTOR, isActive, same hospital
 * - Includes capacity information
 * 
 * Returns: {
 *   success: true,
 *   data: { doctors: [{ id, firstName, lastName, currentActivePatients, maxConcurrentPatients, isAvailable, department }] }
 * }
 */
export const getQueueDoctors = async (req, res, next) => {
  try {
    const user = req.user;

    // Only ADMIN or Primary Staff can get doctors list
    const isAdmin = user && user.role === 'ADMIN';
    const isPrimary = user && user.isPrimary === true;

    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role or Primary staff required.',
      });
    }

    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required.',
      });
    }

    const doctors = await prisma.user.findMany({
      where: {
        hospitalId: user.hospitalId,
        role: 'STAFF',
        staffRole: 'DOCTOR',
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        currentActivePatients: true,
        maxConcurrentPatients: true,
        isAvailable: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { currentActivePatients: 'asc' },
        { firstName: 'asc' },
      ],
    });

    return res.status(200).json({
      success: true,
      data: { doctors },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send email notification to patient for queue entry
 * POST /api/queue/:id/email
 * 
 * Sends email notification to patient about their queue status
 * 
 * Rules:
 * - Only STAFF or ADMIN allowed
 * - Queue entry must exist and belong to user's hospital
 * - Patient must have email
 * 
 * Body: { message: string (required) }
 * 
 * Returns: { success: true, message: 'Email sent successfully' }
 */
export const sendQueueEmail = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { message } = req.body;

    if (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required.',
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required.',
      });
    }

    const queueEntry = await prisma.queueEntry.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
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
            name: true,
          },
        },
      },
    });

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Queue entry not found.',
      });
    }

    if (queueEntry.hospitalId !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Queue entry does not belong to your hospital.',
      });
    }

    if (!queueEntry.patient?.email) {
      return res.status(400).json({
        success: false,
        message: 'Patient email not found for this queue entry.',
      });
    }

    // Import email service
    const { sendAnnouncement } = await import('../services/emailService.js');

    // Send email notification
    const emailSubject = `Queue Update - ${queueEntry.ticketNumber}`;
    const emailResult = await sendAnnouncement(
      queueEntry.patient.email,
      emailSubject,
      message.trim(),
      queueEntry.hospital.name
    );

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send email notification.',
      });
    }

    // Audit log
    console.log(`[AUDIT] User ${user.id} (${user.email}) sent email to patient ${queueEntry.patient.id} for queue entry ${id}.`);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully.',
    });
  } catch (error) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Bulk notify patients in queue
 * POST /api/queue/bulk-notify
 * 
 * Sends email notifications to multiple patients
 * 
 * Rules:
 * - Only ADMIN or Primary Staff allowed
 * - All queue entries must belong to user's hospital
 * - Patients must have email
 * 
 * Body: {
 *   queueEntryIds: string[] (required),
 *   message: string (required)
 * }
 * 
 * Returns: {
 *   success: true,
 *   data: { sentCount: number, failedCount: number, failedEntries: [] }
 * }
 */
export const bulkNotifyQueue = async (req, res, next) => {
  try {
    const user = req.user;
    const { queueEntryIds, message } = req.body;

    // Only ADMIN or Primary Staff can bulk notify
    const isAdmin = user && user.role === 'ADMIN';
    const isPrimary = user && user.isPrimary === true;

    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role or Primary staff required.',
      });
    }

    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required.',
      });
    }

    if (!queueEntryIds || !Array.isArray(queueEntryIds) || queueEntryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'queueEntryIds array is required and must not be empty.',
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required.',
      });
    }

    // Import email service
    const { sendAnnouncement } = await import('../services/emailService.js');

    const result = await prisma.$transaction(async (tx) => {
      // Find all queue entries
      const queueEntries = await tx.queueEntry.findMany({
        where: {
          id: { in: queueEntryIds },
        },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          hospital: {
            select: {
              name: true,
            },
          },
        },
      });

      // Validate all entries exist
      if (queueEntries.length !== queueEntryIds.length) {
        const foundIds = queueEntries.map(e => e.id);
        const missingIds = queueEntryIds.filter(id => !foundIds.includes(id));
        throw new Error(`Queue entries not found: ${missingIds.join(', ')}`);
      }

      // Validate hospital ownership
      const invalidHospitalEntries = queueEntries.filter(
        entry => entry.hospitalId !== user.hospitalId
      );

      if (invalidHospitalEntries.length > 0) {
        throw new Error(
          `Access denied. ${invalidHospitalEntries.length} queue entry(ies) do not belong to your hospital.`
        );
      }

      // Send emails
      let sentCount = 0;
      let failedCount = 0;
      const failedEntries = [];

      for (const entry of queueEntries) {
        try {
          if (!entry.patient?.email) {
            failedEntries.push({
              queueEntryId: entry.id,
              ticketNumber: entry.ticketNumber,
              reason: 'Patient email not found',
            });
            failedCount++;
            continue;
          }

          const emailSubject = `Queue Update - ${entry.ticketNumber}`;
          const emailResult = await sendAnnouncement(
            entry.patient.email,
            emailSubject,
            message.trim(),
            entry.hospital.name
          );

          if (emailResult.success) {
            sentCount++;
          } else {
            failedEntries.push({
              queueEntryId: entry.id,
              ticketNumber: entry.ticketNumber,
              reason: emailResult.error || 'Failed to send email',
            });
            failedCount++;
          }
        } catch (error) {
          failedEntries.push({
            queueEntryId: entry.id,
            ticketNumber: entry.ticketNumber,
            reason: error.message || 'Unknown error',
          });
          failedCount++;
        }
      }

      return {
        sentCount,
        failedCount,
        failedEntries,
      };
    });

    // Audit log
    console.log(`[AUDIT] User ${user.id} (${user.email}) bulk notified ${result.sentCount} patients. Failed: ${result.failedCount}`);

    if (result.failedCount > 0) {
      return res.status(200).json({
        success: false,
        message: `Sent ${result.sentCount} notifications. Failed to send ${result.failedCount} notifications.`,
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully sent ${result.sentCount} notification(s).`,
      data: result,
    });
  } catch (error) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Update queue entry priority
 * PATCH /api/queue/:id/priority
 * 
 * Updates the priority of a queue entry
 * 
 * Rules:
 * - Only ADMIN or Primary Staff allowed
 * - Queue entry must exist and belong to user's hospital
 * - Priority must be valid: URGENT, HIGH, NORMAL, LOW
 * 
 * Body: { priority: string (required) }
 * 
 * Returns: { success: true, data: { queueEntry } }
 */
export const updateQueuePriority = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { priority } = req.body;

    // Only ADMIN or Primary Staff can update priority
    const isAdmin = user && user.role === 'ADMIN';
    const isPrimary = user && user.isPrimary === true;

    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role or Primary staff required.',
      });
    }

    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required.',
      });
    }

    if (!priority) {
      return res.status(400).json({
        success: false,
        message: 'Priority is required.',
      });
    }

    const validPriorities = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
    const upperPriority = priority.toUpperCase();

    if (!validPriorities.includes(upperPriority)) {
      return res.status(400).json({
        success: false,
        message: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Find queue entry
      const queueEntry = await tx.queueEntry.findUnique({
        where: { id },
        select: {
          id: true,
          hospitalId: true,
          priority: true,
        },
      });

      if (!queueEntry) {
        throw new Error('Queue entry not found.');
      }

      if (queueEntry.hospitalId !== user.hospitalId) {
        throw new Error('Access denied. Queue entry does not belong to your hospital.');
      }

      // Update priority
      const updated = await tx.queueEntry.update({
        where: { id },
        data: { priority: upperPriority },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
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

      return updated;
    });

    // Audit log
    console.log(`[AUDIT] User ${user.id} (${user.email}) updated priority of queue entry ${id} to ${upperPriority}.`);

    return res.status(200).json({
      success: true,
      message: 'Priority updated successfully.',
      data: { queueEntry: result },
    });
  } catch (error) {
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get real-time wait time for a queue entry
 * GET /api/queue/:id/wait-time
 * 
 * Returns current estimated wait time for the queue entry
 * Requires: STAFF or ADMIN role, or patient owns the entry
 */
export const getQueueEntryWaitTime = async (req, res, next) => {
  try {
    const user = req.user;
    const patient = req.patient;
    const { id } = req.params;

    // Allow both staff and patient access
    if (!user && !patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const queueEntry = await prisma.queueEntry.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        patient: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Queue entry not found.',
      });
    }

    // Validate access
    if (user) {
      // Staff/Admin: must belong to same hospital
      if (user.hospitalId !== queueEntry.hospitalId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Queue entry does not belong to your hospital.',
        });
      }
    } else if (patient) {
      // Patient: must own the entry
      if (patient.id !== queueEntry.patientId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This queue entry does not belong to you.',
        });
      }
    }

    // Only calculate for active entries
    if (!['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'].includes(queueEntry.status)) {
      return res.status(200).json({
        success: true,
        data: {
          estimatedWaitMinutes: null,
          message: 'Queue entry is not in an active status.',
        },
      });
    }

    // Get department-specific consultation time
    const avgConsultationTimeMinutes = await getConsultationTimeForDepartment(queueEntry.departmentId);

    // Count active available doctors with capacity
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

    const doctorsWithCapacity = availableDoctors.filter(
      (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
    );

    const activeDoctors = doctorsWithCapacity.length;

    let estimatedWaitMinutes = null;

    // Count waiting queue entries (WAITING, TRIAGE, CALLED) - needed for both calculation and variance
    const waitingCount = await prisma.queueEntry.count({
      where: {
        hospitalId: queueEntry.hospitalId,
        departmentId: queueEntry.departmentId,
        status: {
          in: ['WAITING', 'TRIAGE', 'CALLED'],
        },
      },
    });

    if (activeDoctors > 0 && waitingCount > 0) {
      const batches = Math.ceil(waitingCount / activeDoctors);
      estimatedWaitMinutes = batches * avgConsultationTimeMinutes;
    } else if (activeDoctors === 0) {
      // No active doctors - wait time cannot be calculated
      estimatedWaitMinutes = null;
    } else if (waitingCount === 0) {
      // No one waiting - immediate service
      estimatedWaitMinutes = 0;
    }

    // Monitor wait time changes for this queue entry
    // This will create notifications if significant changes are detected
    // Do this asynchronously after the response is sent
    setImmediate(async () => {
      try {
        await monitorWaitTimeForEntry(id);
      } catch (error) {
        console.error('Error monitoring wait time for queue entry:', error);
        // Don't throw - this is a background operation
      }
    });

    // Calculate confidence interval
    let minWaitMinutes = null;
    let maxWaitMinutes = null;
    if (estimatedWaitMinutes !== null) {
      // Variance factor: ±20% base, increases with queue size and decreases with doctor count
      const varianceFactor = Math.max(0.15, Math.min(0.30, (waitingCount / Math.max(activeDoctors, 1)) * 0.05));
      const confidenceInterval = estimatedWaitMinutes * varianceFactor;
      minWaitMinutes = Math.max(0, Math.round(estimatedWaitMinutes - confidenceInterval));
      maxWaitMinutes = Math.round(estimatedWaitMinutes + confidenceInterval);
    }

    res.status(200).json({
      success: true,
      data: {
        queueEntryId: id,
        estimatedWaitMinutes,
        minWaitMinutes,
        maxWaitMinutes,
        avgConsultationTimeMinutes,
        activeDoctors,
        waitingCount: waitingCount || 0,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
