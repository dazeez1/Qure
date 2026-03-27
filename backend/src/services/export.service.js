import { getDashboardOverview } from './dashboard.service.js';
import { getDailyTrends, getPeakHours } from './analytics.service.js';
import prisma from '../config/database.js';

/**
 * Escape CSV field - handles commas, quotes, and newlines
 * @param {string} field - Field value to escape
 * @returns {string} - Escaped field value
 */
function escapeCsvField(field) {
  if (field === null || field === undefined) {
    return '';
  }

  const str = String(field);
  
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Generate hospital export as CSV string
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.hospitalId - Hospital ID (required)
 * @param {number} params.days - Number of days for trends (default: 7)
 * @returns {Promise<string>} - CSV string
 */
export async function generateHospitalExport({ hospitalId, days = 7 }) {
  // Validate hospitalId
  if (!hospitalId) {
    throw new Error('hospitalId is required');
  }

  // Validate days
  if (typeof days !== 'number' || days < 1 || days > 365) {
    throw new Error('days must be a number between 1 and 365');
  }

  // Calculate date range for queue data
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  // Fetch all data in parallel
  const [dashboard, dailyTrends, peakHours, queueEntries, feedbackRows] =
    await Promise.all([
    getDashboardOverview({ hospitalId }),
    getDailyTrends({ hospitalId, days }),
    getPeakHours({ hospitalId, days }),
    // Fetch all queue entries within date range
    prisma.queueEntry.findMany({
      where: {
        hospitalId,
        checkInTime: {
          gte: startDate,
          lte: today,
        },
      },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        priority: true,
        checkInTime: true,
        patient: {
          select: {
            fullName: true,
            email: true,
          },
        },
        department: {
          select: {
            name: true,
          },
        },
        assignedDoctor: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        waitingArea: {
          select: {
            name: true,
          },
        },
        assignedRoom: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        checkInTime: 'desc',
      },
    }),
    // Feedback without appointment join (avoids Prisma 500 if appointment was deleted in DB)
    prisma.feedback.findMany({
      where: {
        hospitalId,
        createdAt: {
          gte: startDate,
          lte: today,
        },
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
        createdAt: 'asc',
      },
    }),
  ]);

  const feedbackAppointmentIds = [
    ...new Set(feedbackRows.map((f) => f.appointmentId)),
  ];
  const feedbackAppointments = feedbackAppointmentIds.length
    ? await prisma.appointment.findMany({
        where: { id: { in: feedbackAppointmentIds } },
        select: {
          id: true,
          appointmentDate: true,
          department: {
            select: { name: true },
          },
        },
      })
    : [];
  const feedbackAppointmentById = new Map(
    feedbackAppointments.map((a) => [a.id, a]),
  );
  const feedbacks = feedbackRows
    .filter((f) => feedbackAppointmentById.has(f.appointmentId))
    .map((f) => ({
      ...f,
      appointment: feedbackAppointmentById.get(f.appointmentId),
    }));

  // Build CSV string
  const csvLines = [];

  // Header
  csvLines.push('=== Hospital Export ===');
  csvLines.push('');

  // Queue Preview Section
  csvLines.push('--- Queue Preview ---');
  csvLines.push('Ticket, Patient, Department, Status, Priority, Check-In Time');
  
  if (dashboard.queuePreview && dashboard.queuePreview.length > 0) {
    dashboard.queuePreview.forEach((entry) => {
      const ticket = escapeCsvField(entry.ticketNumber || '');
      const patient = escapeCsvField(entry.patient?.fullName || 'Unknown');
      const department = escapeCsvField(entry.department?.name || 'Unknown');
      const status = escapeCsvField(entry.status || '');
      const priority = escapeCsvField(entry.priority || '');
      const checkInTime = entry.checkInTime 
        ? escapeCsvField(new Date(entry.checkInTime).toLocaleString())
        : '';
      
      csvLines.push(`${ticket}, ${patient}, ${department}, ${status}, ${priority}, ${checkInTime}`);
    });
  } else {
    csvLines.push('No queue entries');
  }
  
  csvLines.push('');
  csvLines.push('');

  // Doctor Load Summary Section
  csvLines.push('--- Doctor Load Summary ---');
  csvLines.push('Doctor, Current Active, Max Concurrent, Available');
  
  if (dashboard.doctorLoadSummary && dashboard.doctorLoadSummary.length > 0) {
    dashboard.doctorLoadSummary.forEach((doctor) => {
      const doctorName = escapeCsvField(
        `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Unknown'
      );
      const currentActive = escapeCsvField(doctor.currentActivePatients || 0);
      const maxConcurrent = escapeCsvField(doctor.maxConcurrentPatients || 0);
      const available = escapeCsvField(
        doctor.isAvailable && 
        (doctor.currentActivePatients || 0) < (doctor.maxConcurrentPatients || 0)
          ? 'Yes'
          : 'No'
      );
      
      csvLines.push(`${doctorName}, ${currentActive}, ${maxConcurrent}, ${available}`);
    });
  } else {
    csvLines.push('No doctors found');
  }
  
  csvLines.push('');
  csvLines.push('');

  // Waiting Areas Section
  csvLines.push('--- Waiting Areas ---');
  csvLines.push('Name, Capacity, Current Occupancy');
  
  if (dashboard.waitingAreaStats && dashboard.waitingAreaStats.length > 0) {
    dashboard.waitingAreaStats.forEach((area) => {
      const name = escapeCsvField(area.name || '');
      const capacity = escapeCsvField(area.capacity || 0);
      const occupancy = escapeCsvField(area.currentOccupancy || 0);
      
      csvLines.push(`${name}, ${capacity}, ${occupancy}`);
    });
  } else {
    csvLines.push('No waiting areas found');
  }
  
  csvLines.push('');
  csvLines.push('');

  // Queue Data Section (all entries within date range)
  csvLines.push('--- Queue Data (All Entries) ---');
  csvLines.push('Ticket, Patient, Email, Department, Status, Priority, Doctor, Waiting Area, Room, Check-In Time');
  
  if (queueEntries && queueEntries.length > 0) {
    queueEntries.forEach((entry) => {
      const ticket = escapeCsvField(entry.ticketNumber || '');
      const patient = escapeCsvField(entry.patient?.fullName || 'Unknown');
      const email = escapeCsvField(entry.patient?.email || '');
      const department = escapeCsvField(entry.department?.name || 'Unknown');
      const status = escapeCsvField(entry.status || '');
      const priority = escapeCsvField(entry.priority || '');
      const doctor = entry.assignedDoctor 
        ? escapeCsvField(`Dr. ${entry.assignedDoctor.firstName} ${entry.assignedDoctor.lastName}`)
        : '';
      const waitingArea = escapeCsvField(entry.waitingArea?.name || '');
      const room = escapeCsvField(entry.assignedRoom?.name || '');
      const checkInTime = entry.checkInTime 
        ? escapeCsvField(new Date(entry.checkInTime).toLocaleString())
        : '';
      
      csvLines.push(`${ticket}, ${patient}, ${email}, ${department}, ${status}, ${priority}, ${doctor}, ${waitingArea}, ${room}, ${checkInTime}`);
    });
  } else {
    csvLines.push('No queue entries found');
  }
  
  csvLines.push('');
  csvLines.push('');

  // Daily Trends Section
  csvLines.push('--- Daily Trends ---');
  csvLines.push('Date, Count');
  
  if (dailyTrends.labels && dailyTrends.data && dailyTrends.labels.length > 0) {
    for (let i = 0; i < dailyTrends.labels.length; i++) {
      const date = escapeCsvField(dailyTrends.labels[i] || '');
      const count = escapeCsvField(dailyTrends.data[i] || 0);
      
      csvLines.push(`${date}, ${count}`);
    }
  } else {
    csvLines.push('No daily trends data');
  }
  
  csvLines.push('');
  csvLines.push('');

  // Peak Hours Section
  csvLines.push('--- Peak Hours ---');
  csvLines.push('Hour, Count');
  
  if (peakHours.labels && peakHours.data && peakHours.labels.length > 0) {
    for (let i = 0; i < peakHours.labels.length; i++) {
      const hour = escapeCsvField(peakHours.labels[i] || '');
      const count = escapeCsvField(peakHours.data[i] || 0);
      
      csvLines.push(`${hour}, ${count}`);
    }
  } else {
    csvLines.push('No peak hours data');
  }
  
  csvLines.push('');
  csvLines.push('');

  // Feedback Report Section
  csvLines.push('--- Feedback Report ---');
  csvLines.push('Date, Patient, Doctor, Department, Rating, Comment');
  
  if (feedbacks && feedbacks.length > 0) {
    feedbacks.forEach((feedback) => {
      const date = feedback.appointment.appointmentDate
        ? escapeCsvField(new Date(feedback.appointment.appointmentDate).toLocaleDateString())
        : '';
      const patient = escapeCsvField(feedback.patient?.fullName || 'Unknown');
      const doctor = feedback.doctor
        ? escapeCsvField(`Dr. ${feedback.doctor.firstName} ${feedback.doctor.lastName}`)
        : '';
      const department = escapeCsvField(feedback.appointment.department?.name || 'Unknown');
      const rating = escapeCsvField(feedback.rating || '');
      const comment = escapeCsvField(feedback.comment || '');
      
      csvLines.push(`${date}, ${patient}, ${doctor}, ${department}, ${rating}, ${comment}`);
    });
  } else {
    csvLines.push('No feedback found');
  }

  // Join all lines with newlines
  return csvLines.join('\n');
}
