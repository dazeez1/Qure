import prisma from '../config/database.js';

/**
 * Get daily trends for queue entries
 * Groups queue entries by date over a specified number of days
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.hospitalId - Hospital ID (required)
 * @param {number} params.days - Number of days to analyze (default: 7)
 * @returns {Promise<Object>} - Object with labels and data arrays
 */
export async function getDailyTrends({ hospitalId, days = 7 }) {
  // Validate hospitalId
  if (!hospitalId) {
    throw new Error('hospitalId is required');
  }

  // Validate days
  if (typeof days !== 'number' || days < 1 || days > 365) {
    throw new Error('days must be a number between 1 and 365');
  }

  // Calculate start date (today - (days - 1))
  // This ensures we get exactly 'days' number of days including today
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0); // Start of start date

  // Fetch queue entries
  const queueEntries = await prisma.queueEntry.findMany({
    where: {
      hospitalId,
      createdAt: {
        gte: startDate,
      },
    },
    select: {
      createdAt: true,
    },
  });

  // Build array of all days in range
  const dateMap = new Map();
  const labels = [];
  const data = [];

  // Initialize all days in range with 0 count
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' }); // Mon, Tue, etc.
    
    dateMap.set(dateKey, {
      label: dayLabel,
      count: 0,
    });
    
    labels.push(dayLabel);
    data.push(0);
  }

  // Count entries per date
  queueEntries.forEach((entry) => {
    const entryDate = new Date(entry.createdAt);
    entryDate.setHours(0, 0, 0, 0);
    const dateKey = entryDate.toISOString().split('T')[0]; // YYYY-MM-DD

    if (dateMap.has(dateKey)) {
      const dayData = dateMap.get(dateKey);
      dayData.count++;
      // Update the data array at the correct index
      const index = labels.indexOf(dayData.label);
      if (index !== -1) {
        data[index] = dayData.count;
      }
    }
  });

  return {
    labels,
    data,
  };
}

/**
 * Get peak hours for queue entries
 * Counts queue entries by hour of the day over a specified number of days
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.hospitalId - Hospital ID (required)
 * @param {number} params.days - Number of days to analyze (default: 7)
 * @returns {Promise<Object>} - Object with labels (24 hours) and data arrays
 */
export async function getPeakHours({ hospitalId, days = 7 }) {
  // Validate hospitalId
  if (!hospitalId) {
    throw new Error('hospitalId is required');
  }

  // Validate days
  if (typeof days !== 'number' || days < 1 || days > 365) {
    throw new Error('days must be a number between 1 and 365');
  }

  // Calculate start date (today - (days - 1))
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0); // Start of start date

  // Fetch queue entries with checkInTime
  // Note: Prisma doesn't support combining gte and not:null in same object
  // So we filter for entries with checkInTime >= startDate and then filter nulls
  const queueEntries = await prisma.queueEntry.findMany({
    where: {
      hospitalId,
      checkInTime: {
        gte: startDate,
      },
    },
    select: {
      checkInTime: true,
    },
  });

  // Filter out entries with null checkInTime
  const entriesWithCheckIn = queueEntries.filter(entry => entry.checkInTime !== null);

  // Initialize array of 24 hours (0-23) with 0 counts
  const hourCounts = new Array(24).fill(0);
  const labels = [];

  // Build labels array ["00:00", "01:00", ..., "23:00"]
  for (let hour = 0; hour < 24; hour++) {
    const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
    labels.push(hourLabel);
  }

  // Count entries per hour
  entriesWithCheckIn.forEach((entry) => {
    const checkInDate = new Date(entry.checkInTime);
    const hour = checkInDate.getHours(); // 0-23
    
    if (hour >= 0 && hour < 24) {
      hourCounts[hour]++;
    }
  });

  return {
    labels,
    data: hourCounts,
  };
}
