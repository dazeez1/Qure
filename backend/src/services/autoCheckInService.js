import prisma from '../config/database.js';
import { checkInToQueue } from '../controllers/queueController.js';

/**
 * Auto-check-in service
 * Automatically checks patients into the queue when their appointment time arrives
 * 
 * This service should be called periodically (e.g., every 5 minutes) via a cron job
 * or scheduled task runner.
 */
export async function processAutoCheckIn() {
  try {
    const now = new Date();
    
    // Find appointments that should be auto-checked in:
    // 1. Status = BOOKED
    // 2. Appointment date/time is today and time has arrived (or up to 15 minutes before)
    // 3. No existing active queue entry
    // 4. Department is ACTIVE
    
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    // Allow check-in up to 15 minutes before appointment time, or anytime after appointment time
    // So if appointment is at 10:00 AM, we can check in from 9:45 AM onwards
    const checkInWindowEnd = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now
    
    const appointmentsToCheckIn = await prisma.appointment.findMany({
      where: {
        status: 'BOOKED',
        appointmentDate: {
          gte: todayStart,
          lte: todayEnd,
        },
        // Appointment time is within check-in window: can check in up to 15 mins before, or anytime after
        appointmentDate: {
          lte: checkInWindowEnd, // Appointment time is within 15 minutes (allows early check-in)
        },
        // No active queue entry
        queueEntry: null,
        // Department is active
        department: {
          status: 'ACTIVE',
        },
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

    console.log(`[Auto-Check-In] Found ${appointmentsToCheckIn.length} appointments to auto-check-in`);

    let successCount = 0;
    let errorCount = 0;

    // Process each appointment
    for (const appointment of appointmentsToCheckIn) {
      try {
        // Create a mock request object for the checkInToQueue function
        // We'll need to extract the core logic or create a service function
        await autoCheckInAppointment(appointment);
        successCount++;
        console.log(`[Auto-Check-In] Successfully checked in appointment ${appointment.id} for patient ${appointment.patient.fullName}`);
      } catch (error) {
        errorCount++;
        console.error(`[Auto-Check-In] Failed to check in appointment ${appointment.id}:`, error.message);
      }
    }

    return {
      success: true,
      processed: appointmentsToCheckIn.length,
      successful: successCount,
      errors: errorCount,
    };
  } catch (error) {
    console.error('[Auto-Check-In] Error processing auto-check-in:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Auto-check-in a single appointment
 * Extracted core logic from checkInToQueue for use in scheduled jobs
 */
async function autoCheckInAppointment(appointment) {
  // Use the same transaction logic as manual check-in
  return await prisma.$transaction(async (tx) => {
    // Validate appointment status = BOOKED
    if (appointment.status !== 'BOOKED') {
      throw new Error(`Cannot auto-check-in. Appointment status is ${appointment.status}.`);
    }

    // Validate appointmentDate = today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appointmentDate = new Date(appointment.appointmentDate);
    appointmentDate.setHours(0, 0, 0, 0);

    if (appointmentDate.getTime() !== today.getTime()) {
      throw new Error('Cannot auto-check-in. Appointment date must be today.');
    }

    // Validate department is ACTIVE
    if (appointment.department.status !== 'ACTIVE') {
      throw new Error('Department is not active. Cannot auto-check-in.');
    }

    // Prevent duplicate queue entry
    const existingQueueEntry = await tx.queueEntry.findFirst({
      where: {
        appointmentId: appointment.id,
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
        },
      },
    });

    if (existingQueueEntry) {
      throw new Error('Patient already has an active queue entry for this appointment.');
    }

    // Generate department-based daily ticket number
    // Use a retry mechanism to handle concurrent check-ins
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let sequenceNumber;
    let ticketNumber;
    let attempts = 0;
    const maxAttempts = 10;

    // Retry logic to handle race conditions
    while (attempts < maxAttempts) {
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

      sequenceNumber = todayQueueCount + 1;
      ticketNumber = `${appointment.department.shortCode}-${String(sequenceNumber).padStart(3, '0')}`;

      // Check if this ticket number already exists (race condition check)
      const existingTicket = await tx.queueEntry.findFirst({
        where: {
          hospitalId: appointment.hospitalId,
          departmentId: appointment.departmentId,
          ticketNumber: ticketNumber,
        },
      });

      if (!existingTicket) {
        // Ticket number is available, break out of loop
        break;
      }

      // Ticket number exists, try next number
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique ticket number after multiple attempts');
      }
    }

    // Auto-assign doctor (same logic as manual check-in)
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
        currentActivePatients: true,
        maxConcurrentPatients: true,
      },
    });

    const doctorsWithCapacity = availableDoctors.filter(
      (doctor) => doctor.currentActivePatients < doctor.maxConcurrentPatients
    );

    let assignedDoctor = null;
    if (doctorsWithCapacity.length > 0) {
      // Assign to doctor with lowest currentActivePatients
      assignedDoctor = doctorsWithCapacity[0];
      
      // Update doctor's currentActivePatients
      await tx.user.update({
        where: { id: assignedDoctor.id },
        data: {
          currentActivePatients: {
            increment: 1,
          },
        },
      });
    }

    // Create QueueEntry
    const queueEntry = await tx.queueEntry.create({
      data: {
        patientId: appointment.patientId,
        appointmentId: appointment.id,
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
    const defaultWaitingArea = await tx.waitingArea.findFirst({
      where: {
        hospitalId: appointment.hospitalId,
        isActive: true,
        isDefault: true,
      },
    });

    if (defaultWaitingArea) {
      const currentOccupancy = await tx.queueEntry.count({
        where: {
          waitingAreaId: defaultWaitingArea.id,
          status: {
            in: ['WAITING', 'TRIAGE', 'CALLED'],
          },
          id: { not: queueEntry.id },
        },
      });

      if (currentOccupancy < defaultWaitingArea.capacity) {
        await tx.queueEntry.update({
          where: { id: queueEntry.id },
          data: {
            waitingAreaId: defaultWaitingArea.id,
          },
        });

        assignedWaitingArea = {
          id: defaultWaitingArea.id,
          name: defaultWaitingArea.name,
        };
      }
    }

    // Update appointment → CHECKED_IN
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CHECKED_IN',
      },
    });

    return {
      queueEntry,
      assignedDoctor: assignedDoctor ? { id: assignedDoctor.id } : null,
      assignedWaitingArea,
      ticketNumber,
    };
  });
}
