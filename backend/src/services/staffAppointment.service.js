import prisma from '../config/database.js';

/**
 * Get staff appointments with filtering and pagination
 * @param {Object} params - Filter and pagination parameters
 * @param {string} params.hospitalId - Hospital ID (required)
 * @param {string} [params.status] - Filter by appointment status
 * @param {string} [params.departmentId] - Filter by department ID
 * @param {string} [params.startDate] - Filter appointments from this date (ISO string)
 * @param {string} [params.endDate] - Filter appointments until this date (ISO string)
 * @param {string} [params.search] - Search by patient full name
 * @param {number} [params.page=1] - Page number (default: 1)
 * @param {number} [params.limit=20] - Items per page (default: 20)
 * @param {string} [params.userRole] - User role (STAFF or ADMIN)
 * @param {boolean} [params.isPrimary] - Whether user is primary staff
 * @param {string} [params.userId] - User ID (for doctor filtering)
 * @returns {Promise<Object>} - Appointments with pagination metadata
 */
async function getStaffAppointments({
  hospitalId,
  status,
  departmentId,
  startDate,
  endDate,
  search,
  page = 1,
  limit = 20,
  userRole,
  isPrimary,
  userId,
}) {
  // Validate hospitalId required
  if (!hospitalId) {
    throw new Error('hospitalId is required');
  }

  // Build where filter
  const where = {
    hospitalId,
    ...(status && { status }),
    ...(departmentId && { departmentId }),
    ...(startDate || endDate
      ? {
          appointmentDate: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }
      : {}),
    ...(search && {
      patient: {
        fullName: {
          contains: search,
          mode: 'insensitive',
        },
      },
    }),
  };

  // Role-based filtering: Doctors see only their assigned appointments
  // Note: Doctors can only see appointments that have been checked in (have a queueEntry)
  // Admin and Primary staff see all appointments
  const isDoctor = userRole === 'STAFF' && !isPrimary;
  if (isDoctor && userId) {
    // Filter to only appointments where queueEntry exists AND assignedDoctorId matches userId
    where.queueEntry = {
      assignedDoctorId: userId,
    };
  }

  // Count total
  const totalCount = await prisma.appointment.count({ where });

  // Fetch paginated
  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      patient: {
        select: { id: true, fullName: true, email: true },
      },
      department: {
        select: { id: true, name: true },
      },
      queueEntry: {
        include: {
          assignedDoctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: {
      appointmentDate: 'asc',
    },
    skip: (page - 1) * limit,
    take: limit,
  });

  // Return structured response
  return {
    appointments,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export { getStaffAppointments };
