import prisma from '../config/database.js';
import { validateRequiredFields } from '../utils/validation.js';

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

    const { status, hospitalId } = req.query;

    // Build where clause
    const where = {
      patientId: patient.id,
    };

    // Add status filter if provided
    if (status) {
      const validStatuses = ['BOOKED', 'CHECKED_IN', 'MOVED_TO_QUEUE', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
      if (!validStatuses.includes(status.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }
      where.status = status.toUpperCase();
    }

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

    // Fetch appointments
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
      },
      orderBy: {
        appointmentDate: 'desc',
      },
    });

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
          createdAt: apt.createdAt,
          updatedAt: apt.updatedAt,
        })),
      },
    });
  } catch (error) {
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

/**
 * Mark appointment as no-show (Staff only)
 * PATCH /api/staff/appointments/:id/no-show
 * 
 * Only BOOKED appointments can be marked as no-show.
 * Staff can mark any appointment in their hospital as no-show.
 */
export const markAppointmentNoShow = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || !user.hospitalId) {
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

    // Verify appointment belongs to staff's hospital
    if (appointment.hospitalId !== user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this appointment.',
      });
    }

    // Verify appointment can be marked as no-show (only BOOKED status)
    if (appointment.status !== 'BOOKED') {
      return res.status(400).json({
        success: false,
        message: `Cannot mark appointment as no-show. Current status is ${appointment.status}. Only BOOKED appointments can be marked as no-show.`,
      });
    }

    // Update appointment status to NO_SHOW
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'NO_SHOW',
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
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Appointment marked as no-show successfully.',
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

/**
 * Cancel appointment (Staff override)
 * PATCH /api/staff/appointments/:id/cancel
 * 
 * Staff can cancel any BOOKED appointment in their hospital.
 */
export const cancelAppointmentStaff = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || !user.hospitalId) {
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

    // Verify appointment belongs to staff's hospital
    if (appointment.hospitalId !== user.hospitalId) {
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

    // Check if appointment has an active queue entry
    const existingQueueEntry = await prisma.queueEntry.findFirst({
      where: {
        appointmentId: id,
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
        },
      },
    });

    if (existingQueueEntry) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel appointment. Patient has an active queue entry. Please handle the queue entry first.',
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
          },
        },
      },
    });

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
