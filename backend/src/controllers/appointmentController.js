import prisma from '../config/database.js';
import { validateRequiredFields } from '../utils/validation.js';
import {
  createAppointmentConfirmationNotification,
  createAppointmentCancellationNotification,
  createAppointmentRescheduleNotification,
} from '../services/patientNotification.service.js';

/**
 * Create a new appointment (Patient only)
 * POST /api/appointments
 * 
 * Body: {
 *   hospitalId: string (required)
 *   departmentId: string (required)
 *   appointmentDate: string (ISO date string, required)
 *   reason: string (optional)
 * }
 */
export const createAppointment = async (req, res, next) => {
  try {
    // Get patient from request (set by authenticatePatient middleware)
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const { hospitalId, departmentId, appointmentDate, reason } = req.body;

    // Validate required fields
    const validation = validateRequiredFields(req.body, ['hospitalId', 'departmentId', 'appointmentDate']);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${validation.missingFields.join(', ')}`,
      });
    }

    // Validate appointmentDate is a valid date
    const appointmentDateTime = new Date(appointmentDate);
    if (isNaN(appointmentDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment date format. Please use ISO date format.',
      });
    }

    // Validate appointment date is in the future
    if (appointmentDateTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Appointment date must be in the future.',
      });
    }

    // Verify hospital exists
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { id: true, name: true },
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found.',
      });
    }

    // Verify department exists and belongs to the hospital
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, hospitalId: true, status: true },
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found.',
      });
    }

    if (department.hospitalId !== hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Department does not belong to the specified hospital.',
      });
    }

    if (department.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Department is not active. Cannot create appointment.',
      });
    }

    // Check for active appointments in OTHER hospitals
    // Prevent booking in a different hospital if patient has any active appointment in another hospital
    const activeAppointmentInOtherHospital = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        hospitalId: {
          not: hospitalId, // Different hospital
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
      },
    });

    if (activeAppointmentInOtherHospital) {
      return res.status(400).json({
        success: false,
        message: `You have an active appointment at ${activeAppointmentInOtherHospital.hospital.name}. Please cancel or complete that appointment before booking at a different hospital.`,
      });
    }

    // Time-overlap validation: Prevent overlapping appointment times within the same hospital only
    // Standard appointment duration: 30 minutes
    const APPOINTMENT_DURATION_MINUTES = 30;
    const appointmentStartTime = appointmentDateTime;
    const appointmentEndTime = new Date(appointmentStartTime.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);

    // Find existing appointments for this patient at the SAME hospital
    // Exclude CANCELLED and COMPLETED appointments as they don't block time slots
    const existingAppointmentsAtSameHospital = await prisma.appointment.findMany({
      where: {
        patientId: patient.id,
        hospitalId: hospitalId, // Same hospital only
        status: {
          notIn: ['CANCELLED', 'COMPLETED'],
        },
      },
      select: {
        id: true,
        appointmentDate: true,
        status: true,
      },
    });

    // Check for time overlaps within the same hospital
    // Two appointments overlap if: newStart < existingEnd AND newEnd > existingStart
    // Assuming same 30-minute duration for existing appointments
    for (const existingAppt of existingAppointmentsAtSameHospital) {
      const existingStartTime = new Date(existingAppt.appointmentDate);
      const existingEndTime = new Date(existingStartTime.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);

      // Check if time windows overlap
      if (appointmentStartTime < existingEndTime && appointmentEndTime > existingStartTime) {
        return res.status(400).json({
          success: false,
          message: `This appointment time overlaps with an existing appointment on ${existingStartTime.toLocaleString()}. Please choose a different time.`,
        });
      }
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        hospitalId: hospitalId,
        departmentId: departmentId,
        appointmentDate: appointmentDateTime,
        status: 'BOOKED',
        reason: reason?.trim() || null,
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
    });

    // Create appointment confirmation notification (non-blocking)
    // Note: No doctor is assigned at appointment creation time - doctors are assigned when checking into queue
    try {
      await createAppointmentConfirmationNotification({
        patientId: patient.id,
        hospitalId: hospitalId,
        appointmentId: appointment.id,
        appointmentDate: appointmentDateTime,
        departmentName: department.name,
        doctorName: null, // No doctor assigned at appointment creation
      });
    } catch (notificationError) {
      console.error('Failed to create appointment confirmation notification:', notificationError);
      // Don't fail appointment creation if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully.',
      data: {
        appointment: {
          id: appointment.id,
          appointmentDate: appointment.appointmentDate,
          status: appointment.status,
          reason: appointment.reason,
          hospital: appointment.hospital,
          department: appointment.department,
          createdAt: appointment.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get patient's appointments
 * GET /api/patient/appointments
 * 
 * Query params:
 *   status: string (optional) - Filter by status (BOOKED, CHECKED_IN, MOVED_TO_QUEUE, IN_CONSULTATION, COMPLETED, CANCELLED, NO_SHOW)
 *   hospitalId: string (optional) - Filter by hospital
 *   page: number (optional) - Page number (default: 1)
 *   limit: number (optional) - Items per page (default: 10)
 */
export const getPatientAppointments = async (req, res, next) => {
  try {
    // Get patient from request (set by authenticatePatient middleware)
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const { status, hospitalId, page = '1', limit = '10' } = req.query;

    // Parse pagination params
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build where clause - only BOOKED appointments
    const where = {
      patientId: patient.id,
      status: 'BOOKED', // Only BOOKED appointments
    };

    // Add hospital filter if provided
    if (hospitalId) {
      // Verify hospital exists
      const hospital = await prisma.hospital.findUnique({
        where: { id: hospitalId },
        select: { id: true },
      });

      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found.',
        });
      }

      where.hospitalId = hospitalId;
    }

    // Get total count for pagination
    const totalCount = await prisma.appointment.count({ where });

    // Fetch appointments with pagination
    const appointments = await prisma.appointment.findMany({
      where,
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
        feedbacks: {
          select: {
            id: true,
          },
          take: 1, // Just check if any feedback exists
        },
      },
      orderBy: {
        appointmentDate: 'asc', // Earliest first (upcoming appointments)
      },
      skip,
      take: limitNum,
    });

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      success: true,
      message: 'Appointments retrieved successfully.',
      data: {
        appointments: appointments.map((apt) => ({
          id: apt.id,
          appointmentDate: apt.appointmentDate,
          status: apt.status,
          reason: apt.reason,
          notes: apt.notes,
          hospital: apt.hospital,
          department: apt.department,
          hasFeedback: apt.feedbacks && apt.feedbacks.length > 0, // Indicate if feedback exists
          createdAt: apt.createdAt,
          updatedAt: apt.updatedAt,
        })),
        pagination: {
          currentPage: pageNum,
          totalPages,
          total: totalCount,
          limit: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reschedule an appointment (Patient only)
 * PATCH /api/appointments/:id/reschedule
 * 
 * Only the patient who owns the appointment can reschedule it.
 * Only BOOKED appointments can be rescheduled.
 * 
 * Body: {
 *   appointmentDate: string (ISO date string, required)
 * }
 */
export const rescheduleAppointment = async (req, res, next) => {
  try {
    // Get patient from request (set by authenticatePatient middleware)
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const { id } = req.params;
    const { appointmentDate } = req.body;

    // Validate required field
    if (!appointmentDate) {
      return res.status(400).json({
        success: false,
        message: 'appointmentDate is required.',
      });
    }

    // Validate appointmentDate is a valid date
    const newAppointmentDateTime = new Date(appointmentDate);
    if (isNaN(newAppointmentDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment date format. Please use ISO date format.',
      });
    }

    // Wrap in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find appointment
      const appointment = await tx.appointment.findUnique({
        where: { id },
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
              status: true,
              hospitalId: true,
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found.');
      }

      // Verify patient owns the appointment
      if (appointment.patientId !== patient.id) {
        throw new Error('You do not have permission to reschedule this appointment.');
      }

      // Validate appointment status = BOOKED
      if (appointment.status !== 'BOOKED') {
        throw new Error(`Cannot reschedule appointment with status: ${appointment.status}. Only BOOKED appointments can be rescheduled.`);
      }

      // Validate department is ACTIVE
      if (appointment.department.status !== 'ACTIVE') {
        throw new Error('Department is not active. Cannot reschedule appointment.');
      }

      // Validate new appointment date is in the future
      if (newAppointmentDateTime <= new Date()) {
        throw new Error('New appointment date must be in the future.');
      }

      // Time-overlap validation: Prevent overlapping appointment times
      // Standard appointment duration: 30 minutes
      const APPOINTMENT_DURATION_MINUTES = 30;
      const newAppointmentStartTime = newAppointmentDateTime;
      const newAppointmentEndTime = new Date(newAppointmentStartTime.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);

      // Find existing appointments for this patient at the SAME hospital
      // Exclude CANCELLED and COMPLETED appointments as they don't block time slots
      // Exclude the current appointment being rescheduled
      const overlappingAppointments = await tx.appointment.findMany({
        where: {
          patientId: patient.id,
          hospitalId: appointment.hospitalId,
          id: { not: id }, // Exclude current appointment
          status: {
            notIn: ['CANCELLED', 'COMPLETED'],
          },
          appointmentDate: {
            gte: newAppointmentStartTime,
            lt: newAppointmentEndTime,
          },
        },
      });

      // Also check for appointments that start before but end during the new appointment window
      const overlappingAppointmentsBefore = await tx.appointment.findMany({
        where: {
          patientId: patient.id,
          hospitalId: appointment.hospitalId,
          id: { not: id },
          status: {
            notIn: ['CANCELLED', 'COMPLETED'],
          },
          appointmentDate: {
            lt: newAppointmentStartTime,
            gte: new Date(newAppointmentStartTime.getTime() - APPOINTMENT_DURATION_MINUTES * 60 * 1000),
          },
        },
      });

      if (overlappingAppointments.length > 0 || overlappingAppointmentsBefore.length > 0) {
        throw new Error('This appointment time conflicts with an existing appointment. Please choose a different time.');
      }

      // Store old date for notification
      const oldDate = appointment.appointmentDate;

      // Update appointment date
      const updatedAppointment = await tx.appointment.update({
        where: { id },
        data: {
          appointmentDate: newAppointmentDateTime,
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
      });

      return { updatedAppointment, oldDate, department: appointment.department };
    });

    // Create reschedule notification (non-blocking)
    // Note: No doctor is assigned at appointment reschedule time - doctors are assigned when checking into queue
    try {
      await createAppointmentRescheduleNotification({
        patientId: patient.id,
        hospitalId: result.updatedAppointment.hospitalId,
        oldDate: result.oldDate,
        newDate: result.updatedAppointment.appointmentDate,
        departmentName: result.department.name,
        doctorName: null, // No doctor assigned at appointment reschedule
      });
    } catch (notificationError) {
      console.error('Failed to create reschedule notification:', notificationError);
      // Don't fail reschedule if notification fails
    }

    res.status(200).json({
      success: true,
      message: 'Appointment rescheduled successfully.',
      data: {
        appointment: {
          id: result.id,
          appointmentDate: result.appointmentDate,
          status: result.status,
          reason: result.reason,
          hospital: result.hospital,
          department: result.department,
          updatedAt: result.updatedAt,
        },
      },
    });
  } catch (error) {
    // Handle validation errors (400)
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
 * Cancel an appointment
 * PATCH /api/appointments/:id/cancel
 * 
 * Only the patient who owns the appointment can cancel it.
 * Only BOOKED appointments can be cancelled.
 */
export const cancelAppointment = async (req, res, next) => {
  try {
    // Get patient from request (set by authenticatePatient middleware)
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const { id } = req.params;

    // Find appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id },
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
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.',
      });
    }

    // Verify patient owns the appointment
    if (appointment.patientId !== patient.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this appointment.',
      });
    }

    // Verify appointment can be cancelled (only BOOKED status)
    if (appointment.status !== 'BOOKED') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel appointment with status: ${appointment.status}. Only BOOKED appointments can be cancelled.`,
      });
    }

    // Update appointment status to CANCELLED
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
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
    });

    // Create cancellation notification (non-blocking)
    try {
      await createAppointmentCancellationNotification({
        patientId: patient.id,
        hospitalId: appointment.hospitalId,
        appointmentDate: appointment.appointmentDate,
        departmentName: appointment.department.name,
      });
    } catch (notificationError) {
      console.error('Failed to create cancellation notification:', notificationError);
      // Don't fail cancellation if notification fails
    }

    res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully.',
      data: {
        appointment: {
          id: updatedAppointment.id,
          appointmentDate: updatedAppointment.appointmentDate,
          status: updatedAppointment.status,
          reason: updatedAppointment.reason,
          hospital: updatedAppointment.hospital,
          department: updatedAppointment.department,
          updatedAt: updatedAppointment.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
