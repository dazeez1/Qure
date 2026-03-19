import prisma from '../config/database.js';

/**
 * Wait Time Service
 *
 * ETA/wait time is never stored in the database. It is always computed on demand from:
 * - position = sequenceNumber - currentServingSequence
 * - activeDoctors, department consultation time
 * So when the queue moves (complete, no-show, cancel, call next), every refetch recalculates ETAs.
 *
 * Handles:
 * - Dynamic average consultation time calculation
 * - Historical wait time metrics
 * - Department-specific consultation times
 */

const DEFAULT_CONSULTATION_TIME = 15; // Fallback if no data
const WAIT_CAP_MINUTES = 120;

/**
 * Single wait-time engine (position-based).
 * "How long until THIS patient is served?"
 * @param {{ position: number, activeDoctors: number, consultationTime: number }} params
 * @returns {number} Estimated wait in minutes (0 = ready now; callers may display ">120 mins" when > 120)
 */
export function calculateQueueWaitTime({ position, activeDoctors, consultationTime }) {
  const pos = Math.max(0, position);
  if (pos <= 0) return 0;
  if (activeDoctors <= 0) return null;
  return Math.ceil(pos / activeDoctors) * consultationTime;
}

/**
 * Format wait time for display using status labels.
 * IN_CONSULTATION → "Now Serving", CALLED → "Next", TRIAGE → "Preparing",
 * WAITING with 0 → "Ready now", else "X mins"; >120 → ">120 mins"
 * @param {number|null} waitMins - From calculateQueueWaitTime
 * @param {string} status - Queue entry status
 * @returns {string}
 */
export function formatWaitTimeDisplay(waitMins, status) {
  if (status === 'IN_CONSULTATION') return 'Now Serving';
  if (status === 'CALLED') return 'Next';
  if (status === 'TRIAGE') return 'Preparing';
  if (waitMins === null || waitMins === undefined) return 'Calculating...';
  if (waitMins <= 0) return 'Ready now';
  if (waitMins > WAIT_CAP_MINUTES) return '>120 mins';
  return `${Math.round(waitMins)} mins`;
}

const PRIORITY_ORDER = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };

/**
 * Get current serving sequence for position-based wait time.
 * - If anyone is IN_CONSULTATION: use the lowest sequenceNumber in IN_CONSULTATION (who we're serving).
 * - If no one is IN_CONSULTATION: use the sequenceNumber of the first in line (priority DESC, then
 *   sequenceNumber ASC) so the first in line has position 0 and wait times are correct.
 * @param {string} hospitalId
 * @param {string} departmentId
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 */
export async function getCurrentServingSequence(hospitalId, departmentId, tx = prisma) {
  const client = tx || prisma;
  const inConsultation = await client.queueEntry.findFirst({
    where: {
      hospitalId,
      departmentId,
      status: 'IN_CONSULTATION',
    },
    orderBy: { sequenceNumber: 'asc' },
    select: { sequenceNumber: true },
  });
  if (inConsultation) return inConsultation.sequenceNumber;
  const active = await client.queueEntry.findMany({
    where: {
      hospitalId,
      departmentId,
      status: { in: ['WAITING', 'TRIAGE', 'CALLED'] },
    },
    select: { sequenceNumber: true, priority: true },
  });
  if (active.length === 0) return 0;
  active.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pb - pa; // higher priority first
    return (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0); // lower sequence first
  });
  return active[0].sequenceNumber ?? 0;
}

/**
 * Get position in queue by index (handles sparse sequence numbers).
 * Returns Map of entryId -> position (0 = next up, 1 = one ahead, etc.)
 * Use this when sequence numbers have gaps from completed/cancelled entries.
 * @param {string} hospitalId
 * @param {string} departmentId
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 * @returns {Promise<Map<string, number>>}
 */
export async function getPositionByIndexForDepartment(hospitalId, departmentId, tx = prisma) {
  const client = tx || prisma;
  const active = await client.queueEntry.findMany({
    where: {
      hospitalId,
      departmentId,
      status: { in: ['WAITING', 'TRIAGE', 'CALLED'] },
    },
    select: { id: true, sequenceNumber: true, priority: true },
  });
  active.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pb - pa;
    return (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0);
  });
  const map = new Map();
  active.forEach((entry, index) => {
    map.set(entry.id, index);
  });
  return map;
}

/**
 * Get count of active doctors with capacity in a department.
 * @param {string} hospitalId
 * @param {string} departmentId
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 */
export async function getActiveDoctorsCount(hospitalId, departmentId, tx = prisma) {
  const client = tx || prisma;
  const doctors = await client.user.findMany({
    where: {
      hospitalId,
      departmentId,
      role: 'STAFF',
      staffRole: 'DOCTOR',
      isActive: true,
      isAvailable: true,
    },
    select: {
      currentActivePatients: true,
      maxConcurrentPatients: true,
    },
  });
  const withCapacity = doctors.filter(
    d => (d.currentActivePatients ?? 0) < (d.maxConcurrentPatients ?? 3)
  );
  return withCapacity.length;
}

/**
 * Compute wait time for one queue entry using the single engine.
 * Fetches currentServingSequence, activeDoctorsCount, consultationTime; returns wait and display.
 * @param {{ hospitalId: string, departmentId: string, sequenceNumber: number, status: string }} entry
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 * @returns {Promise<{ waitMins: number|null, position: number, waitTimeDisplay: string }>}
 */
export async function getWaitTimeForEntry(entry, tx = prisma) {
  const { hospitalId, departmentId, sequenceNumber, status } = entry;
  const currentServingSequence = await getCurrentServingSequence(hospitalId, departmentId, tx);
  const position = Math.max(0, sequenceNumber - currentServingSequence);
  const activeDoctors = await getActiveDoctorsCount(hospitalId, departmentId, tx);
  const consultationTime = await getConsultationTimeForDepartment(departmentId);
  const waitMins = calculateQueueWaitTime({ position, activeDoctors, consultationTime });
  const waitTimeDisplay = formatWaitTimeDisplay(waitMins, status);
  return { waitMins: waitMins ?? null, position, waitTimeDisplay };
}

/**
 * Calculate average consultation time for a department from historical data
 * @param {string} departmentId - Department ID
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Promise<number|null>} Average consultation time in minutes, or null if insufficient data
 */
export async function calculateDepartmentAvgConsultationTime(departmentId, days = 30) {
  try {
    const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  cutoffDate.setHours(0, 0, 0, 0);

  // Get completed queue entries with consultation time data
  const completedEntries = await prisma.queueEntry.findMany({
    where: {
      departmentId,
      status: 'COMPLETED',
      checkInTime: {
        gte: cutoffDate,
      },
      assignedDoctorId: {
        not: null,
      },
    },
    select: {
      checkInTime: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  if (completedEntries.length < 5) {
    // Need at least 5 completed consultations for reliable average
    return null;
  }

  // Calculate consultation time for each entry
  // Consultation time = time from check-in to completion
  const consultationTimes = completedEntries
    .map(entry => {
      const checkIn = new Date(entry.checkInTime);
      const completed = new Date(entry.updatedAt);
      const diffMs = completed.getTime() - checkIn.getTime();
      return diffMs / (1000 * 60); // Convert to minutes
    })
    .filter(time => time > 0 && time < 120); // Filter out invalid times (0 or >2 hours)

  if (consultationTimes.length < 5) {
    return null;
  }

  // Calculate average
  const sum = consultationTimes.reduce((acc, time) => acc + time, 0);
  const average = sum / consultationTimes.length;

  // Round to 1 decimal place
  return Math.round(average * 10) / 10;
  } catch (error) {
    console.error('Error calculating department average consultation time:', error);
    return null;
  }
}

/**
 * Update department's average consultation time
 * @param {string} departmentId - Department ID
 * @returns {Promise<void>}
 */
export async function updateDepartmentAvgConsultationTime(departmentId) {
  try {
    const avgTime = await calculateDepartmentAvgConsultationTime(departmentId, 30);

    await prisma.department.update({
      where: { id: departmentId },
      data: {
        avgConsultationTimeMinutes: avgTime,
      },
    });

    if (avgTime !== null) {
      console.log(`[WaitTime] Updated department ${departmentId} average consultation time: ${avgTime} minutes`);
    }
  } catch (error) {
    console.error('Error updating department average consultation time:', error);
  }
}

/**
 * Get consultation time to use for wait time calculation
 * Uses department average if available, otherwise uses default
 * @param {string} departmentId - Department ID
 * @returns {Promise<number>} Consultation time in minutes
 */
export async function getConsultationTimeForDepartment(departmentId) {
  try {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: {
        avgConsultationTimeMinutes: true,
        defaultConsultationTimeMinutes: true,
      },
    });

    if (!department) {
      return DEFAULT_CONSULTATION_TIME;
    }

    // Use calculated average if available, otherwise use default, otherwise use system default
    return department.avgConsultationTimeMinutes ?? 
           department.defaultConsultationTimeMinutes ?? 
           DEFAULT_CONSULTATION_TIME;
  } catch (error) {
    console.error('Error getting consultation time for department:', error);
    return DEFAULT_CONSULTATION_TIME;
  }
}

/**
 * Store daily wait time metrics for a department
 * Should be called at end of day or periodically
 * @param {string} departmentId - Department ID
 * @param {Date} date - Date to store metrics for (default: today)
 * @returns {Promise<void>}
 */
export async function storeDailyWaitTimeMetrics(departmentId, date = new Date()) {
  try {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: {
        hospitalId: true,
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    // Set date to start of day
    const metricsDate = new Date(date);
    metricsDate.setHours(0, 0, 0, 0);
    const metricsDateEnd = new Date(metricsDate);
    metricsDateEnd.setHours(23, 59, 59, 999);

    // Get all completed entries for the day
    const completedEntries = await prisma.queueEntry.findMany({
      where: {
        departmentId,
        status: 'COMPLETED',
        checkInTime: {
          gte: metricsDate,
          lte: metricsDateEnd,
        },
      },
      select: {
        checkInTime: true,
        updatedAt: true,
      },
    });

    // Get no-shows and cancelled for the day
    const noShows = await prisma.queueEntry.count({
      where: {
        departmentId,
        status: 'NO_SHOW',
        checkInTime: {
          gte: metricsDate,
          lte: metricsDateEnd,
        },
      },
    });

    const cancelled = await prisma.queueEntry.count({
      where: {
        departmentId,
        status: 'CANCELLED',
        checkInTime: {
          gte: metricsDate,
          lte: metricsDateEnd,
        },
      },
    });

    // Calculate average wait time
    let avgWaitTime = null;
    let avgConsultationTime = null;

    if (completedEntries.length > 0) {
      const waitTimes = completedEntries.map(entry => {
        const checkIn = new Date(entry.checkInTime);
        const completed = new Date(entry.updatedAt);
        return (completed.getTime() - checkIn.getTime()) / (1000 * 60); // minutes
      });

      avgWaitTime = waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length;
      avgWaitTime = Math.round(avgWaitTime * 10) / 10;

      // Calculate average consultation time (time from check-in to completion)
      avgConsultationTime = avgWaitTime; // For completed entries, wait time = consultation time
      avgConsultationTime = Math.round(avgConsultationTime * 10) / 10;
    }

    // Upsert metrics
    await prisma.waitTimeMetric.upsert({
      where: {
        departmentId_date: {
          departmentId,
          date: metricsDate,
        },
      },
      create: {
        departmentId,
        hospitalId: department.hospitalId,
        date: metricsDate,
        avgWaitTimeMinutes: avgWaitTime ?? 0,
        totalCompleted: completedEntries.length,
        totalNoShows: noShows,
        totalCancelled: cancelled,
        avgConsultationTimeMinutes: avgConsultationTime,
      },
      update: {
        avgWaitTimeMinutes: avgWaitTime ?? 0,
        totalCompleted: completedEntries.length,
        totalNoShows: noShows,
        totalCancelled: cancelled,
        avgConsultationTimeMinutes: avgConsultationTime,
      },
    });

    console.log(`[WaitTime] Stored daily metrics for department ${departmentId} on ${metricsDate.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('Error storing daily wait time metrics:', error);
    throw error;
  }
}

/**
 * Get historical wait time analytics for a department
 * @param {string} departmentId - Department ID
 * @param {number} days - Number of days to retrieve (default: 30)
 * @returns {Promise<Array>} Array of daily metrics
 */
export async function getHistoricalWaitTimeAnalytics(departmentId, days = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const metrics = await prisma.waitTimeMetric.findMany({
      where: {
        departmentId,
        date: {
          gte: cutoffDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    return metrics;
  } catch (error) {
    console.error('Error getting historical wait time analytics:', error);
    return [];
  }
}

/**
 * Get historical wait time analytics for a hospital (all departments)
 * @param {string} hospitalId - Hospital ID
 * @param {number} days - Number of days to retrieve (default: 30)
 * @returns {Promise<Array>} Array of daily metrics grouped by department
 */
export async function getHospitalHistoricalWaitTimeAnalytics(hospitalId, days = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const metrics = await prisma.waitTimeMetric.findMany({
      where: {
        hospitalId,
        date: {
          gte: cutoffDate,
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
        date: 'asc',
      },
    });

    return metrics;
  } catch (error) {
    console.error('Error getting hospital historical wait time analytics:', error);
    return [];
  }
}
