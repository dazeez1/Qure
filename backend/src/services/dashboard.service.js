import prisma from '../config/database.js';

/**
 * Get high-level dashboard overview data for a staff user.
 *
 * All queries are strictly scoped to the provided hospitalId.
 *
 * @param {Object} params
 * @param {string} params.hospitalId - Required hospital identifier
 * @param {string} [params.departmentId] - Optional department filter
 * @param {string} [params.search] - Optional free-text search for ticketNumber / patient fullName
 * @returns {Promise<{
 *   hospitalName: string | null,
 *   queuePreview: any[],
 *   queueCounts: {
 *     WAITING: number,
 *     TRIAGE: number,
 *     CALLED: number
 *   },
 *   noShowsToday: number,
 *   doctorLoadSummary: any[],
 *   waitingAreaStats: any[],
 *   roomStats: any[]
 * }>}
 */
export async function getDashboardOverview({ hospitalId, departmentId, search }) {
  if (!hospitalId) {
    throw new Error('hospitalId is required for getDashboardOverview');
  }

  // --------------------------------------------
  // Shared filters
  // --------------------------------------------
  const queueBaseFilter = {
    hospitalId,
    status: {
      in: ['WAITING', 'TRIAGE', 'CALLED'],
    },
    ...(departmentId && { departmentId }),
  };

  // Apply optional search across ticketNumber and patient.fullName
  const queueFilter =
    search && search.trim().length > 0
      ? {
          ...queueBaseFilter,
          OR: [
            {
              ticketNumber: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              patient: {
                fullName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          ],
        }
      : queueBaseFilter;

  // Today range for "no shows today"
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // --------------------------------------------
  // Parallel data fetching
  // --------------------------------------------
  const [
    hospital,
    queuePreview,
    queueCountsRaw,
    noShowsToday,
    doctorLoadSummary,
    waitingAreas,
    waitingAreaOccupancyByArea,
    roomOccupancyByRoom,
  ] = await Promise.all([
    // a) Hospital name
    prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    }),

    // b) Queue preview (max 8)
    prisma.queueEntry.findMany({
      where: queueFilter,
      orderBy: [
        { priority: 'desc' },
        { sequenceNumber: 'asc' },
      ],
      take: 8,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        priority: true,
        sequenceNumber: true,
        checkInTime: true,
        patient: {
          select: {
            fullName: true,
          },
        },
        department: {
          select: {
            name: true,
          },
        },
      },
    }),

    // c) Queue counts grouped by status
    prisma.queueEntry.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
      where: queueFilter,
    }),

    // d) No-shows today (count only)
    prisma.queueEntry.count({
      where: {
        hospitalId,
        status: 'NO_SHOW',
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
        ...(departmentId && { departmentId }),
      },
    }),

    // e) Doctor load summary (only doctors)
    prisma.user.findMany({
      where: {
        hospitalId,
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
        firstName: 'asc',
      },
    }),

    // f) Waiting areas (capacity + basic info)
    prisma.waitingArea.findMany({
      where: {
        hospitalId,
      },
      select: {
        id: true,
        name: true,
        capacity: true,
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    }),

    // g) Waiting area occupancy counts grouped by waitingAreaId
    prisma.queueEntry.groupBy({
      by: ['waitingAreaId'],
      _count: {
        id: true,
      },
      where: {
        hospitalId,
        status: {
          in: ['WAITING', 'TRIAGE', 'CALLED'],
        },
        waitingAreaId: {
          not: null,
        },
      },
    }),

    // h) Room stats – count IN_CONSULTATION grouped by room
    prisma.queueEntry.groupBy({
      by: ['assignedRoomId'],
      _count: {
        id: true,
      },
      where: {
        hospitalId,
        status: 'IN_CONSULTATION',
        assignedRoomId: {
          not: null,
        },
      },
    }),
  ]);

  // Normalize queueCounts into a simple object
  const queueCounts = {
    WAITING: 0,
    TRIAGE: 0,
    CALLED: 0,
  };

  queueCountsRaw.forEach((row) => {
    if (queueCounts[row.status] !== undefined) {
      queueCounts[row.status] = row._count.id || 0;
    }
  });

  // Build waiting area stats using a pre-aggregated occupancy map (avoid N+1 queries)
  const waitingAreaOccupancyMap = new Map();
  waitingAreaOccupancyByArea.forEach((row) => {
    if (row.waitingAreaId) {
      waitingAreaOccupancyMap.set(row.waitingAreaId, row._count.id || 0);
    }
  });

  const waitingAreaStats = waitingAreas.map((area) => ({
    id: area.id,
    name: area.name,
    capacity: area.capacity,
    isActive: area.isActive,
    currentOccupancy: waitingAreaOccupancyMap.get(area.id) || 0,
  }));

  // Map room occupancy stats (IN_CONSULTATION count grouped by room)
  // First, get rooms for this hospital
  const rooms = await prisma.room.findMany({
    where: {
      hospitalId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      departmentId: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const occupancyMap = new Map();
  roomOccupancyByRoom.forEach((row) => {
    if (row.assignedRoomId) {
      occupancyMap.set(row.assignedRoomId, row._count.id || 0);
    }
  });

  const roomStats = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    departmentId: room.departmentId,
    inConsultationCount: occupancyMap.get(room.id) || 0,
  }));

  // Calculate average wait time today
  const waitingCount = queueCounts.WAITING + queueCounts.TRIAGE + queueCounts.CALLED;
  const availableDoctors = doctorLoadSummary.filter(
    (d) => d.isAvailable && d.currentActivePatients < d.maxConcurrentPatients
  ).length;

  const averageWaitTimeToday =
    availableDoctors > 0
      ? Math.ceil(waitingCount / availableDoctors) * 15
      : 0;

  return {
    hospitalName: hospital?.name || null,
    queuePreview,
    queueCounts,
    noShowsToday,
    doctorLoadSummary,
    waitingAreaStats,
    roomStats,
    averageWaitTimeToday,
  };
}

