import prisma from '../config/database.js';

/**
 * Create patient feedback
 * POST /api/patient/feedback
 * 
 * Body: {
 *   appointmentId: string (required)
 *   rating: number (required, 1-5)
 *   comment: string (optional)
 * }
 * 
 * Rules:
 * - Patient must be authenticated
 * - Appointment must exist and belong to patient
 * - Appointment status must be COMPLETED
 * - Rating must be between 1-5
 * - Prevent duplicate feedback (one feedback per appointment per patient)
 */
export const createPatientFeedback = async (req, res, next) => {
  try {
    const patient = req.patient;
    if (!patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const { appointmentId, rating, comment } = req.body;

    // Validate required fields
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'appointmentId is required.',
      });
    }

    if (rating === undefined || rating === null) {
      return res.status(400).json({
        success: false,
        message: 'rating is required.',
      });
    }

    // Validate rating range
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'rating must be an integer between 1 and 5.',
      });
    }

    // Wrap in transaction (extend timeout for hosted DB latency)
    const result = await prisma.$transaction(
      async (tx) => {
      // Find appointment and verify ownership
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: {
            select: {
              id: true,
            },
          },
          queueEntry: {
            select: {
              assignedDoctorId: true,
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found.');
      }

      // Verify patient owns the appointment
      if (appointment.patientId !== patient.id) {
        throw new Error('You do not have permission to provide feedback for this appointment.');
      }

      // Verify appointment status is COMPLETED
      if (appointment.status !== 'COMPLETED') {
        throw new Error(`Cannot provide feedback for appointment with status: ${appointment.status}. Only COMPLETED appointments can receive feedback.`);
      }

      // Check for existing feedback (prevent duplicate)
      const existingFeedback = await tx.feedback.findUnique({
        where: {
          patientId_appointmentId: {
            patientId: patient.id,
            appointmentId: appointmentId,
          },
        },
      });

      if (existingFeedback) {
        throw new Error('You have already provided feedback for this appointment.');
      }

      // Get doctorId from queue entry if available
      const doctorId = appointment.queueEntry?.assignedDoctorId || null;

      // Create feedback
      const feedback = await tx.feedback.create({
        data: {
          rating,
          comment: comment?.trim() || null,
          patientId: patient.id,
          appointmentId: appointmentId,
          doctorId: doctorId,
          hospitalId: appointment.hospitalId,
        },
        include: {
          patient: {
            select: {
              fullName: true,
            },
          },
          doctor: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          appointment: {
            select: {
              appointmentDate: true,
              department: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      return feedback;
    },
    { timeout: 15000 });

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully.',
      data: {
        feedback: {
          id: result.id,
          rating: result.rating,
          comment: result.comment,
          createdAt: result.createdAt,
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
 * Get hospital feedback (public)
 * GET /api/feedback/hospital/:hospitalId
 * 
 * Returns recent feedback for display
 * Only includes: rating, comment, patient name, doctor name, date
 * Does NOT expose private data (email, phone, etc.)
 */
export const getHospitalFeedback = async (req, res, next) => {
  try {
    const { hospitalId } = req.params;

    // Validate hospitalId
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

    // Load feedback without joining appointment. If appointments were removed
    // directly in MongoDB (bypassing Prisma), orphan feedback rows still exist;
    // Prisma would throw "appointment is required... got null" on include.
    const feedbacks = await prisma.feedback.findMany({
      where: {
        hospitalId: hospitalId,
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        appointmentId: true,
        patient: {
          select: {
            fullName: true,
          },
        },
        doctor: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    const appointmentIds = [...new Set(feedbacks.map((f) => f.appointmentId))];
    const appointments = appointmentIds.length
      ? await prisma.appointment.findMany({
          where: { id: { in: appointmentIds } },
          select: {
            id: true,
            appointmentDate: true,
            department: {
              select: { name: true },
            },
          },
        })
      : [];
    const appointmentById = new Map(appointments.map((a) => [a.id, a]));

    // Skip orphan feedback (appointment deleted outside Prisma / bad data)
    const formattedFeedbacks = feedbacks
      .filter((f) => appointmentById.has(f.appointmentId))
      .map((feedback) => {
        const appt = appointmentById.get(feedback.appointmentId);
        return {
          id: feedback.id,
          rating: feedback.rating,
          comment: feedback.comment,
          patientName: feedback.patient.fullName,
          doctorName: feedback.doctor
            ? `${feedback.doctor.firstName} ${feedback.doctor.lastName}`
            : null,
          departmentName: appt.department?.name ?? null,
          date: appt.appointmentDate,
          createdAt: feedback.createdAt,
        };
      });

    res.status(200).json({
      success: true,
      data: formattedFeedbacks,
    });
  } catch (error) {
    next(error);
  }
};
