import { getStaffAppointments } from '../services/staffAppointment.service.js';
import prisma from '../config/database.js';
import { sendAnnouncement } from '../services/emailService.js';
import { createAppointmentRescheduleNotification } from '../services/patientNotification.service.js';

/**
 * Get staff appointments with filtering and pagination
 * GET /api/staff/appointments
 * 
 * Query params:
 *   status: string (optional) - Filter by appointment status
 *   departmentId: string (optional) - Filter by department ID
 *   startDate: string (optional) - Filter appointments from this date (ISO string)
 *   endDate: string (optional) - Filter appointments until this date (ISO string)
 *   search: string (optional) - Search by patient full name
 *   page: number (optional, default: 1) - Page number
 *   limit: number (optional, default: 20) - Items per page
 */
export async function getStaffAppointmentsController(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Allow only STAFF, ADMIN, or isPrimary === true
    const { role, isPrimary } = req.user;
    if (role !== 'STAFF' && role !== 'ADMIN' && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff, Admin, or Primary staff only.',
      });
    }

    // Extract hospitalId from req.user.hospitalId
    const hospitalId = req.user.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID is required. User must be associated with a hospital.',
      });
    }

    // Extract query params
    const {
      status,
      departmentId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    // Convert page and limit to numbers
    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    // Validate page and limit are valid numbers
    if (isNaN(pageNumber) || pageNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page number. Must be a positive integer.',
      });
    }

    if (isNaN(limitNumber) || limitNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid limit. Must be a positive integer.',
      });
    }

    // Get user ID for role-based filtering (role and isPrimary already extracted above)
    const userId = req.user?.id;

    // Call service with role-based parameters
    const result = await getStaffAppointments({
      hospitalId,
      status,
      departmentId,
      startDate,
      endDate,
      search,
      page: pageNumber,
      limit: limitNumber,
      userRole: role,
      isPrimary: isPrimary,
      userId: userId,
    });

    // Return success response
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Handle validation errors (400)
    if (error.message && error.message.includes('required')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Handle other errors (500)
    console.error('Error in getStaffAppointmentsController:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to fetch appointments.',
    });
  }
}

/**
 * Cancel an appointment (Staff)
 * PATCH /api/staff/appointments/:id/cancel
 * 
 * Allows staff (STAFF or ADMIN) to cancel a patient's appointment
 * 
 * Rules:
 * - Only STAFF or ADMIN allowed
 * - Appointment must exist and belong to user's hospital
 * - Appointment status must be BOOKED
 * - Cannot cancel if active queue entry exists (status not in COMPLETED, CANCELLED, NO_SHOW)
 * 
 * Returns: {
 *   success: true,
 *   message: string,
 *   data: { appointment: {...} }
 * }
 */
export async function cancelAppointmentStaff(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Allow only STAFF or ADMIN
    const { role } = req.user;
    if (role !== 'STAFF' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!req.user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { id } = req.params;

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
      if (appointment.hospitalId !== req.user.hospitalId) {
        throw new Error('Appointment does not belong to your hospital.');
      }

      // Validate appointment status = BOOKED
      if (appointment.status !== 'BOOKED') {
        throw new Error(`Cannot cancel appointment with status: ${appointment.status}. Only BOOKED appointments can be cancelled.`);
      }

      // Prevent cancel if active queue entry exists
      const activeQueueEntry = await tx.queueEntry.findFirst({
        where: {
          appointmentId: id,
          status: {
            notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
          },
        },
      });

      if (activeQueueEntry) {
        throw new Error('Cannot cancel appointment. An active queue entry exists for this appointment.');
      }

      // Update appointment status to CANCELLED
      const updatedAppointment = await tx.appointment.update({
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
          patient: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      return updatedAppointment;
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully.',
      data: {
        appointment: {
          id: result.id,
          appointmentDate: result.appointmentDate,
          status: result.status,
          reason: result.reason,
          notes: result.notes,
          hospital: result.hospital,
          department: result.department,
          patient: result.patient,
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

    // Handle other errors (500)
    console.error('Error in cancelAppointmentStaff:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to cancel appointment.',
    });
  }
}

/**
 * Mark appointment as NO_SHOW (Staff)
 * PATCH /api/staff/appointments/:id/no-show
 * 
 * Allows staff (STAFF or ADMIN) to mark a patient's appointment as no-show
 * 
 * Rules:
 * - Only STAFF or ADMIN allowed
 * - Appointment must exist and belong to user's hospital
 * - Appointment status must be BOOKED
 * - Appointment date must be in the past (appointmentDate < current time)
 * 
 * Returns: {
 *   success: true,
 *   message: string,
 *   data: { appointment: {...} }
 * }
 */
export async function markAppointmentNoShow(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Allow only STAFF or ADMIN
    const { role } = req.user;
    if (role !== 'STAFF' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!req.user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { id } = req.params;

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
      if (appointment.hospitalId !== req.user.hospitalId) {
        throw new Error('Appointment does not belong to your hospital.');
      }

      // Validate appointment status = BOOKED
      if (appointment.status !== 'BOOKED') {
        throw new Error(`Cannot mark as no-show. Appointment status is ${appointment.status}. Only BOOKED appointments can be marked as no-show.`);
      }

      // Validate appointmentDate < current time
      const appointmentDate = new Date(appointment.appointmentDate);
      const now = new Date();

      if (appointmentDate >= now) {
        throw new Error('Cannot mark as no-show. Appointment date must be in the past.');
      }

      // Update appointment status to NO_SHOW
      const updatedAppointment = await tx.appointment.update({
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
              shortCode: true,
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

      return updatedAppointment;
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Appointment marked as no-show successfully.',
      data: {
        appointment: {
          id: result.id,
          appointmentDate: result.appointmentDate,
          status: result.status,
          reason: result.reason,
          notes: result.notes,
          hospital: result.hospital,
          department: result.department,
          patient: result.patient,
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

    // Handle other errors (500)
    console.error('Error in markAppointmentNoShow:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to mark appointment as no-show.',
    });
  }
}

/**
 * Reschedule an appointment (Staff)
 * PATCH /api/staff/appointments/:id/reschedule
 * 
 * Allows staff (STAFF or ADMIN) to reschedule a patient's appointment
 * 
 * Rules:
 * - Only STAFF or ADMIN allowed
 * - Appointment must exist and belong to user's hospital
 * - Appointment status must be BOOKED
 * - New appointment date must be in the future
 * - New appointment date must not overlap with existing appointments (30 minute window)
 * - Department must still be ACTIVE
 * 
 * Request body: {
 *   appointmentDate: string (ISO date string, required)
 * }
 * 
 * Returns: {
 *   success: true,
 *   message: string,
 *   data: { appointment: {...} }
 * }
 */
export async function rescheduleAppointment(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Allow only STAFF or ADMIN
    const { role } = req.user;
    if (role !== 'STAFF' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!req.user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
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
      if (appointment.hospitalId !== req.user.hospitalId) {
        throw new Error('Appointment does not belong to your hospital.');
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
      const existingAppointmentsAtSameHospital = await tx.appointment.findMany({
        where: {
          patientId: appointment.patientId,
          hospitalId: appointment.hospitalId,
          id: { not: id }, // Exclude current appointment
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
      for (const existingAppt of existingAppointmentsAtSameHospital) {
        const existingStartTime = new Date(existingAppt.appointmentDate);
        const existingEndTime = new Date(existingStartTime.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);

        // Check if time windows overlap
        // Two appointments overlap if: newStart < existingEnd AND newEnd > existingStart
        if (newAppointmentStartTime < existingEndTime && newAppointmentEndTime > existingStartTime) {
          throw new Error(`This appointment time overlaps with an existing appointment on ${existingStartTime.toLocaleString()}. Please choose a different time.`);
        }
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
          patient: {
            select: {
              id: true,
              fullName: true,
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
        patientId: result.updatedAppointment.patient.id,
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

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Appointment rescheduled successfully.',
      data: {
        appointment: {
          id: result.id,
          appointmentDate: result.appointmentDate,
          status: result.status,
          reason: result.reason,
          notes: result.notes,
          hospital: result.hospital,
          department: result.department,
          patient: result.patient,
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

    // Handle other errors (500)
    console.error('Error in rescheduleAppointment:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to reschedule appointment.',
    });
  }
}

/**
 * Update appointment details (notes and reason)
 * PATCH /api/staff/appointments/:id
 * 
 * Allows staff (STAFF or ADMIN) to update appointment notes and reason
 * 
 * Rules:
 * - Only STAFF or ADMIN allowed
 * - Appointment must exist and belong to user's hospital
 * - Can update notes and reason for any appointment status
 * 
 * Request body: {
 *   notes: string (optional)
 *   reason: string (optional)
 * }
 * 
 * Returns: {
 *   success: true,
 *   message: string,
 *   data: { appointment: {...} }
 * }
 */
export async function updateAppointment(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Allow only STAFF or ADMIN
    const { role } = req.user;
    if (role !== 'STAFF' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!req.user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { id } = req.params;
    const { notes, reason } = req.body;

    // At least one field must be provided
    if (notes === undefined && reason === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (notes or reason) must be provided.',
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
      if (appointment.hospitalId !== req.user.hospitalId) {
        throw new Error('Appointment does not belong to your hospital.');
      }

      // Build update data
      const updateData = {};
      if (notes !== undefined) {
        updateData.notes = notes?.trim() || null;
      }
      if (reason !== undefined) {
        updateData.reason = reason?.trim() || null;
      }

      // Update appointment
      const updatedAppointment = await tx.appointment.update({
        where: { id },
        data: updateData,
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
          patient: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      return updatedAppointment;
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Appointment updated successfully.',
      data: {
        appointment: {
          id: result.id,
          appointmentDate: result.appointmentDate,
          status: result.status,
          reason: result.reason,
          notes: result.notes,
          hospital: result.hospital,
          department: result.department,
          patient: result.patient,
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

    // Handle other errors (500)
    console.error('Error in updateAppointment:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to update appointment.',
    });
  }
}

/**
 * Send message/notification to patient
 * POST /api/staff/appointments/:id/message
 * 
 * Allows staff (STAFF or ADMIN) to send a message to a patient about their appointment
 * 
 * Rules:
 * - Only STAFF or ADMIN allowed
 * - Appointment must exist and belong to user's hospital
 * - Sends email notification to patient
 * - Creates in-app announcement for patient (audience: PATIENT)
 * 
 * Request body: {
 *   message: string (required)
 * }
 * 
 * Returns: {
 *   success: true,
 *   message: string,
 *   data: { emailSent: boolean, announcementCreated: boolean }
 * }
 */
export async function sendAppointmentMessage(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Allow only STAFF or ADMIN
    const { role } = req.user;
    if (role !== 'STAFF' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!req.user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { id } = req.params;
    const { message } = req.body;

    // Validate required field
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required.',
      });
    }

    // Wrap in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find appointment with patient and hospital info
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
            },
          },
          patient: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found.');
      }

      // Validate appointment belongs to user's hospital
      if (appointment.hospitalId !== req.user.hospitalId) {
        throw new Error('Appointment does not belong to your hospital.');
      }

      // Format appointment date for message
      const appointmentDate = new Date(appointment.appointmentDate);
      const formattedDate = appointmentDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      // Create message title
      const title = `Appointment Update - ${formattedDate}`;

      // Build message content with appointment details
      const fullMessage = `Regarding your appointment on ${formattedDate} at ${formattedTime} in ${appointment.department.name}:\n\n${message.trim()}`;

      let emailSent = false;
      let announcementCreated = false;

      // Send email notification (check patient preferences first)
      try {
        const { shouldSendEmailToPatient } = await import('../services/emailService.js');
        const canSendEmail = await shouldSendEmailToPatient(
          appointment.patient.id,
          appointment.hospitalId
        );

        if (canSendEmail) {
          await sendAnnouncement(
            appointment.patient.email,
            title,
            fullMessage,
            appointment.hospital.name
          );
          emailSent = true;
        }
        // If patient has disabled emails, skip silently
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the request if email fails
      }

      // Create in-app notification for patient
      try {
        const { createPatientNotification } = await import('../services/patientNotification.service.js');
        await createPatientNotification({
          patientId: appointment.patient.id,
          hospitalId: appointment.hospitalId,
          type: 'APPOINTMENT_MESSAGE',
          title: title,
          content: fullMessage,
          category: 'ANNOUNCEMENT',
          priority: 'NORMAL',
          sendEmail: false, // Email already sent above
        });
        announcementCreated = true;
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't fail the request if notification creation fails
      }

      return {
        emailSent,
        announcementCreated,
      };
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Message sent successfully.',
      data: {
        emailSent: result.emailSent,
        announcementCreated: result.announcementCreated,
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

    // Handle other errors (500)
    console.error('Error in sendAppointmentMessage:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to send message.',
    });
  }
}

/**
 * Get available doctors for appointment's department
 * GET /api/staff/appointments/:id/doctors
 * 
 * Returns list of available doctors in the appointment's department
 * 
 * Rules:
 * - Only ADMIN allowed
 * - Appointment must exist and belong to user's hospital
 * - Returns doctors: STAFF, DOCTOR, isActive, same department
 * 
 * Returns: {
 *   success: true,
 *   data: { doctors: [{ id, firstName, lastName, currentActivePatients, maxConcurrentPatients, isAvailable }] }
 * }
 */
export async function getAppointmentDoctors(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Only ADMIN allowed
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.',
      });
    }

    // Validate hospital association
    if (!req.user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { id } = req.params;

    // Find appointment with department
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            hospitalId: true,
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

    // Validate appointment belongs to user's hospital
    if (appointment.hospitalId !== req.user.hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Appointment does not belong to your hospital.',
      });
    }

    // Find available doctors in the appointment's department
    const doctors = await prisma.user.findMany({
      where: {
        hospitalId: req.user.hospitalId,
        departmentId: appointment.departmentId,
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
      },
      orderBy: {
        lastName: 'asc',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Doctors retrieved successfully.',
      data: {
        doctors,
      },
    });
  } catch (error) {
    console.error('Error in getAppointmentDoctors:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to retrieve doctors.',
    });
  }
}

/**
 * Assign/reassign doctor to appointment
 * PATCH /api/staff/appointments/:id/assign-doctor
 * 
 * Allows ADMIN to assign or reassign a doctor to an appointment
 * 
 * Rules:
 * - Only ADMIN allowed
 * - Appointment must exist and belong to user's hospital
 * - Doctor must exist, be STAFF, DOCTOR, isActive, same department
 * - If appointment has queueEntry, update queueEntry.assignedDoctorId
 * - If appointment doesn't have queueEntry, doctor assignment happens at check-in
 * 
 * Request body: {
 *   doctorId: string (required) - Doctor ID to assign, or null to unassign
 * }
 * 
 * Returns: {
 *   success: true,
 *   message: string,
 *   data: { appointment: {...}, queueEntry: {...} }
 * }
 */
export async function assignAppointmentDoctor(req, res) {
  try {
    // Access control: Require req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // Access control: Only ADMIN allowed
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.',
      });
    }

    // Validate hospital association
    if (!req.user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { id } = req.params;
    const { doctorId } = req.body;

    // Wrap in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find appointment with queueEntry
      const appointment = await tx.appointment.findUnique({
        where: { id },
        include: {
          department: {
            select: {
              id: true,
              name: true,
              hospitalId: true,
            },
          },
          queueEntry: {
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
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found.');
      }

      // Validate appointment belongs to user's hospital
      if (appointment.hospitalId !== req.user.hospitalId) {
        throw new Error('Appointment does not belong to your hospital.');
      }

      // If doctorId is provided, validate doctor
      if (doctorId) {
        const doctor = await tx.user.findUnique({
          where: { id: doctorId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            staffRole: true,
            isActive: true,
            hospitalId: true,
            departmentId: true,
            currentActivePatients: true,
            maxConcurrentPatients: true,
          },
        });

        if (!doctor) {
          throw new Error('Doctor not found.');
        }

        // Validate doctor
        if (doctor.role !== 'STAFF') {
          throw new Error('Selected user is not a staff member.');
        }

        if (doctor.staffRole !== 'DOCTOR') {
          throw new Error('Selected staff member is not a doctor.');
        }

        if (!doctor.isActive) {
          throw new Error('Selected doctor is not active.');
        }

        if (doctor.hospitalId !== req.user.hospitalId) {
          throw new Error('Doctor does not belong to your hospital.');
        }

        if (doctor.departmentId !== appointment.departmentId) {
          throw new Error('Doctor does not belong to the appointment\'s department.');
        }
      }

      // If appointment has a queueEntry, update it
      if (appointment.queueEntry) {
        const oldDoctorId = appointment.queueEntry.assignedDoctorId;
        const queueEntryStatus = appointment.queueEntry.status;

        // Handle load management for IN_CONSULTATION status
        if (queueEntryStatus === 'IN_CONSULTATION') {
          // Decrement old doctor if exists
          if (oldDoctorId && oldDoctorId !== doctorId) {
            const oldDoctor = await tx.user.findUnique({
              where: { id: oldDoctorId },
              select: {
                currentActivePatients: true,
              },
            });

            if (oldDoctor && oldDoctor.currentActivePatients > 0) {
              await tx.user.update({
                where: { id: oldDoctorId },
                data: {
                  currentActivePatients: Math.max(0, oldDoctor.currentActivePatients - 1),
                },
              });
            }
          }

          // Increment new doctor if provided and different from old
          if (doctorId && doctorId !== oldDoctorId) {
            const newDoctor = await tx.user.findUnique({
              where: { id: doctorId },
              select: {
                currentActivePatients: true,
                maxConcurrentPatients: true,
              },
            });

            if (newDoctor) {
              // Check capacity
              if (newDoctor.currentActivePatients >= newDoctor.maxConcurrentPatients) {
                throw new Error(`Doctor is at maximum capacity (${newDoctor.currentActivePatients}/${newDoctor.maxConcurrentPatients}). Cannot assign.`);
              }

              await tx.user.update({
                where: { id: doctorId },
                data: {
                  currentActivePatients: newDoctor.currentActivePatients + 1,
                },
              });
            }
          }
        }

        // Update queueEntry
        const updatedQueueEntry = await tx.queueEntry.update({
          where: { id: appointment.queueEntry.id },
          data: {
            assignedDoctorId: doctorId || null,
          },
          include: {
            assignedDoctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        return {
          appointment,
          queueEntry: updatedQueueEntry,
        };
      }

      // If no queueEntry, doctor assignment will happen at check-in
      // Just return appointment info
      return {
        appointment,
        queueEntry: null,
      };
    });

    // Build response message
    let message = 'Doctor assignment updated successfully.';
    if (result.queueEntry) {
      if (result.queueEntry.assignedDoctor) {
        message = `Doctor assigned: ${result.queueEntry.assignedDoctor.lastName}`;
      } else {
        message = 'Doctor assignment removed.';
      }
    } else {
      message = 'Appointment does not have a queue entry yet. Doctor will be assigned at check-in.';
    }

    return res.status(200).json({
      success: true,
      message,
      data: {
        appointment: {
          id: result.appointment.id,
          status: result.appointment.status,
          department: result.appointment.department,
        },
        queueEntry: result.queueEntry ? {
          id: result.queueEntry.id,
          assignedDoctor: result.queueEntry.assignedDoctor,
        } : null,
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

    // Handle other errors (500)
    console.error('Error in assignAppointmentDoctor:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Failed to assign doctor.',
    });
  }
}
