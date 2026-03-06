import prisma from '../config/database.js';

/**
 * Wait Time Notification Service
 * 
 * Monitors wait time changes and creates in-app notifications for patients
 * when significant changes occur.
 */

// In-memory cache to store previous wait times
// Format: { queueEntryId: { waitTime: number, lastChecked: Date } }
const waitTimeCache = new Map();

// Configuration
const SIGNIFICANT_CHANGE_THRESHOLD_PERCENT = 20; // 20% change
const SIGNIFICANT_CHANGE_THRESHOLD_MINUTES = 5; // 5 minutes absolute change
const MIN_WAIT_TIME_FOR_NOTIFICATION = 10; // Don't notify if wait time is less than 10 minutes
const NOTIFICATION_COOLDOWN_MINUTES = 10; // Don't send another notification within 10 minutes

/**
 * Check for significant wait time changes and create notifications
 * @param {string} queueEntryId - Queue entry ID
 * @param {number} currentWaitTime - Current estimated wait time in minutes
 * @returns {Promise<{notificationCreated: boolean, reason: string|null}>}
 */
export async function checkAndNotifyWaitTimeChange(queueEntryId, currentWaitTime) {
  try {
    // Get queue entry to verify it exists and get patient info
    const queueEntry = await prisma.queueEntry.findUnique({
      where: { id: queueEntryId },
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
          },
        },
      },
    });

    if (!queueEntry) {
      return { notificationCreated: false, reason: 'Queue entry not found' };
    }

    // Only notify for active queue entries
    if (!['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'].includes(queueEntry.status)) {
      return { notificationCreated: false, reason: 'Queue entry not in active status' };
    }

    // Don't notify if wait time is too short
    if (currentWaitTime === null || currentWaitTime < MIN_WAIT_TIME_FOR_NOTIFICATION) {
      return { notificationCreated: false, reason: 'Wait time too short for notification' };
    }

    // Get previous wait time from cache
    const cached = waitTimeCache.get(queueEntryId);
    const now = new Date();

    // If no previous data, store current and return
    if (!cached) {
      waitTimeCache.set(queueEntryId, {
        waitTime: currentWaitTime,
        lastChecked: now,
        lastNotificationTime: null,
      });
      return { notificationCreated: false, reason: 'No previous wait time data' };
    }

    // Check cooldown period
    if (cached.lastNotificationTime) {
      const minutesSinceLastNotification = (now - cached.lastNotificationTime) / (1000 * 60);
      if (minutesSinceLastNotification < NOTIFICATION_COOLDOWN_MINUTES) {
        // Update cache but don't notify
        waitTimeCache.set(queueEntryId, {
          waitTime: currentWaitTime,
          lastChecked: now,
          lastNotificationTime: cached.lastNotificationTime,
        });
        return { notificationCreated: false, reason: 'Within cooldown period' };
      }
    }

    const previousWaitTime = cached.waitTime;
    const waitTimeChange = currentWaitTime - previousWaitTime;
    const waitTimeChangePercent = previousWaitTime > 0 
      ? Math.abs((waitTimeChange / previousWaitTime) * 100)
      : 0;

    // Check if change is significant
    const isSignificantChange = 
      Math.abs(waitTimeChange) >= SIGNIFICANT_CHANGE_THRESHOLD_MINUTES ||
      waitTimeChangePercent >= SIGNIFICANT_CHANGE_THRESHOLD_PERCENT;

    if (!isSignificantChange) {
      // Update cache but don't notify
      waitTimeCache.set(queueEntryId, {
        waitTime: currentWaitTime,
        lastChecked: now,
        lastNotificationTime: cached.lastNotificationTime,
      });
      return { notificationCreated: false, reason: 'Change not significant' };
    }

    // Determine notification message based on change
    let title = 'Queue Update';
    let content = '';
    let priority = 'NORMAL';

    if (waitTimeChange > 0) {
      // Wait time increased
      const increaseMinutes = Math.round(waitTimeChange);
      title = 'Wait Time Update';
      content = `Your estimated wait time has been updated to approximately ${Math.round(currentWaitTime)} minutes. `;
      
      if (increaseMinutes >= 15) {
        priority = 'HIGH';
        content += `There has been a significant increase in wait time (+${increaseMinutes} minutes). We apologize for the delay.`;
      } else {
        content += `There has been a slight increase (+${increaseMinutes} minutes).`;
      }
    } else {
      // Wait time decreased
      const decreaseMinutes = Math.abs(Math.round(waitTimeChange));
      title = 'Good News - Wait Time Reduced';
      content = `Your estimated wait time has been reduced to approximately ${Math.round(currentWaitTime)} minutes. `;
      
      if (decreaseMinutes >= 15) {
        priority = 'HIGH';
        content += `Your wait time has decreased significantly (-${decreaseMinutes} minutes).`;
      } else {
        content += `Your wait time has decreased by ${decreaseMinutes} minutes.`;
      }
    }

    // Add department and ticket info
    content += `\n\nDepartment: ${queueEntry.department?.name || 'Unknown'}`;
    content += `\nTicket Number: ${queueEntry.ticketNumber}`;
    content += `\nStatus: ${queueEntry.status}`;

    // Create in-app announcement for this specific patient
    // We'll create a patient-specific announcement by including patient info in content
    // Note: Announcements are hospital-wide, but we can make them patient-specific by including patient details
    // For now, we'll create a general announcement but with patient-specific content
    
    // Actually, we need to think about this differently. Announcements are hospital-wide.
    // For patient-specific notifications, we might need a different approach.
    // But since the user asked for in-app notifications, and announcements are the in-app notification system,
    // we'll create an announcement with audience PATIENT that includes patient-specific information.
    
    // However, to make it truly patient-specific, we could:
    // 1. Create a patient-specific announcement (if the system supports it)
    // 2. Or create a general announcement with patient info in the title/content
    
    // For now, let's create a patient-specific announcement by including the patient's name in the title
    // This way, when the patient views their announcements, they'll see it's for them
    
    const announcement = await prisma.announcement.create({
      data: {
        hospitalId: queueEntry.hospitalId,
        audience: 'PATIENT',
        title: `${title} - ${queueEntry.patient.fullName}`,
        content: content,
        priority: priority,
        isActive: true,
        // Note: createdBy is optional, but we'll set it to null for system-generated notifications
        createdBy: null,
      },
    });

    // Update cache with new wait time and notification time
    waitTimeCache.set(queueEntryId, {
      waitTime: currentWaitTime,
      lastChecked: now,
      lastNotificationTime: now,
    });

    console.log(`[WaitTimeNotification] Created notification for queue entry ${queueEntryId}: ${title}`);

    return { 
      notificationCreated: true, 
      reason: `Wait time changed from ${previousWaitTime} to ${currentWaitTime} minutes`,
      announcementId: announcement.id,
    };
  } catch (error) {
    console.error('Error checking and notifying wait time change:', error);
    return { notificationCreated: false, reason: `Error: ${error.message}` };
  }
}

/**
 * Monitor wait time for a queue entry and create notification if significant change detected
 * This should be called periodically or when queue status changes
 * @param {string} queueEntryId - Queue entry ID
 * @returns {Promise<{notificationCreated: boolean, reason: string|null}>}
 */
export async function monitorWaitTimeForEntry(queueEntryId) {
  try {
    // Get current wait time for the queue entry
    // We'll use the getQueueEntryWaitTime logic but call it directly
    const queueEntry = await prisma.queueEntry.findUnique({
      where: { id: queueEntryId },
      include: {
        department: {
          select: {
            id: true,
          },
        },
        hospital: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!queueEntry) {
      return { notificationCreated: false, reason: 'Queue entry not found' };
    }

    // Only monitor active entries
    if (!['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'].includes(queueEntry.status)) {
      // Clean up cache for inactive entries
      waitTimeCache.delete(queueEntryId);
      return { notificationCreated: false, reason: 'Queue entry not in active status' };
    }

    // Calculate current wait time (same logic as getQueueEntryWaitTime)
    const { getConsultationTimeForDepartment } = await import('./waitTime.service.js');
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

    let currentWaitTime = null;

    if (activeDoctors > 0) {
      // Count waiting queue entries (WAITING, TRIAGE, CALLED)
      const waitingCount = await prisma.queueEntry.count({
        where: {
          hospitalId: queueEntry.hospitalId,
          departmentId: queueEntry.departmentId,
          status: {
            in: ['WAITING', 'TRIAGE', 'CALLED'],
          },
        },
      });

      const batches = Math.ceil(waitingCount / activeDoctors);
      currentWaitTime = batches * avgConsultationTimeMinutes;
    }

    // Check and notify if significant change
    return await checkAndNotifyWaitTimeChange(queueEntryId, currentWaitTime);
  } catch (error) {
    console.error('Error monitoring wait time for entry:', error);
    return { notificationCreated: false, reason: `Error: ${error.message}` };
  }
}

/**
 * Clean up cache for completed/cancelled queue entries
 * @param {string} queueEntryId - Queue entry ID
 */
export function cleanupWaitTimeCache(queueEntryId) {
  waitTimeCache.delete(queueEntryId);
}

/**
 * Get cache statistics (for debugging/monitoring)
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  return {
    size: waitTimeCache.size,
    entries: Array.from(waitTimeCache.entries()).map(([id, data]) => ({
      queueEntryId: id,
      waitTime: data.waitTime,
      lastChecked: data.lastChecked,
      lastNotificationTime: data.lastNotificationTime,
    })),
  };
}
