import prisma from '../config/database.js';
import { getCache, setCache } from '../utils/cache.js';

/**
 * Get all hospitals (public endpoint)
 * GET /api/public/hospitals
 * Returns all hospitals that have at least one active department
 * Public route - no authentication required
 */
export const getHospitals = async (req, res, next) => {
  try {
    const cacheKey = 'public:hospitals';
    const cached = getCache(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        message: 'Hospitals retrieved successfully (cache)',
        data: cached,
      });
    }

    // Get all hospitals that have at least one active department
    const hospitals = await prisma.hospital.findMany({
      where: {
        departments: {
          some: {
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        name: true,
        address: true,
        timeZone: true,
        logoUrl: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Cache for 60 seconds – hospitals change infrequently
    setCache(cacheKey, hospitals, 60 * 1000);

    res.status(200).json({
      success: true,
      message: 'Hospitals retrieved successfully',
      data: hospitals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get departments for a specific hospital (public endpoint)
 * GET /api/public/hospitals/:hospitalId/departments
 * Returns all active departments for the specified hospital
 * Public route - no authentication required
 */
export const getHospitalDepartments = async (req, res, next) => {
  try {
    const { hospitalId } = req.params;

    const cacheKey = `public:hospital:${hospitalId}:departments`;
    const cached = getCache(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        message: 'Departments retrieved successfully (cache)',
        data: cached,
      });
    }

    // Verify hospital exists
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { id: true, name: true },
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found.',
      });
    }

    // Get all active departments for this hospital
    const departments = await prisma.department.findMany({
      where: {
        hospitalId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        shortCode: true,
        defaultConsultationTimeMinutes: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Cache departments per hospital for 60 seconds
    setCache(cacheKey, departments, 60 * 1000);

    res.status(200).json({
      success: true,
      message: 'Departments retrieved successfully',
      data: departments,
    });
  } catch (error) {
    next(error);
  }
};
