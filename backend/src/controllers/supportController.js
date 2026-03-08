import prisma from '../config/database.js';
import { sendSupportMessageEmail } from '../services/emailService.js';

/**
 * Create a support contact message
 * POST /api/support/contact
 * 
 * Body:
 * - name: string (required)
 * - email: string (required, must be valid email)
 * - message: string (required, min length)
 * 
 * If patient is authenticated, patientId and hospitalId are automatically attached
 */
export const createSupportMessage = async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }

    // Validate message length (min 10 characters, max 5000)
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters long',
      });
    }

    if (trimmedMessage.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message must not exceed 5000 characters',
      });
    }

    // Get patient info if authenticated (from optional middleware)
    let patientId = null;
    let hospitalId = null;

    // Check if patient is authenticated (req.patient is set by authenticatePatient middleware)
    if (req.patient) {
      patientId = req.patient.id;
      
      // Try to get hospitalId from patient's recent appointments or queue entries
      const recentAppointment = await prisma.appointment.findFirst({
        where: {
          patientId: patientId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          hospitalId: true,
        },
      });

      if (recentAppointment) {
        hospitalId = recentAppointment.hospitalId;
      } else {
        // Try to get from queue entries
        const recentQueueEntry = await prisma.queueEntry.findFirst({
          where: {
            patientId: patientId,
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            hospitalId: true,
          },
        });

        if (recentQueueEntry) {
          hospitalId = recentQueueEntry.hospitalId;
        }
      }
    }

    // Create support message
    const supportMessage = await prisma.supportMessage.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        message: trimmedMessage,
        patientId: patientId || null,
        hospitalId: hospitalId || null,
      },
    });

    // Send email notification to support@qure.com (non-blocking)
    try {
      await sendSupportMessageEmail({
        name: supportMessage.name,
        email: supportMessage.email,
        message: supportMessage.message,
        patientId: supportMessage.patientId,
        hospitalId: supportMessage.hospitalId,
      });
    } catch (emailError) {
      // Log error but don't fail the request
      console.error('Failed to send support message email notification:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you soon.',
      data: {
        id: supportMessage.id,
      },
    });
  } catch (error) {
    next(error);
  }
};
