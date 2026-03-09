import prisma from '../config/database.js';

/**
 * Create a new waiting area
 * POST /api/waiting-areas
 * 
 * Admin or Primary Staff only endpoint
 * 
 * Body: {
 *   name: string (required)
 *   capacity: number (required, must be > 0)
 *   floor: string (optional)
 *   facility: string (optional)
 * }
 * 
 * Validates:
 * - Hospital ownership
 * - Composite uniqueness (hospitalId, name)
 * 
 * Returns: Created waiting area object
 */
export const createWaitingArea = async (req, res, next) => {
  try {
    const user = req.user;
    const { name, capacity, floor, facility, isDefault } = req.body;

    // Validate user is ADMIN or Primary
    const isAdmin = user && user.role === 'ADMIN';
    const isPrimary = user && user.isPrimary === true;
    
    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role or Primary staff required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Waiting area name is required.',
      });
    }

    if (capacity === undefined || capacity === null) {
      return res.status(400).json({
        success: false,
        message: 'Capacity is required.',
      });
    }

    // Validate capacity is a positive integer
    const capacityNum = parseInt(capacity, 10);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Capacity must be a positive integer.',
      });
    }

    // Wrap in transaction for atomicity (especially for isDefault handling, extend timeout for hosted DB latency)
    const waitingArea = await prisma.$transaction(
      async (tx) => {
      // Check composite uniqueness (hospitalId + name)
      const existingWaitingArea = await tx.waitingArea.findFirst({
        where: {
          hospitalId: user.hospitalId,
          name: name.trim(),
        },
      });

      if (existingWaitingArea) {
        throw new Error('A waiting area with this name already exists in your hospital.');
      }

      // Handle isDefault: if setting to true, unset all other defaults in hospital
      const shouldBeDefault = isDefault === true || isDefault === 'true';
      
      if (shouldBeDefault) {
        // Set all other waiting areas in hospital to isDefault = false
        await tx.waitingArea.updateMany({
          where: {
            hospitalId: user.hospitalId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      // Create waiting area
      return await tx.waitingArea.create({
        data: {
          name: name.trim(),
          capacity: capacityNum,
          floor: floor?.trim() || null,
          facility: facility?.trim() || null,
          hospitalId: user.hospitalId,
          isActive: true,
          isDefault: shouldBeDefault,
        },
      });
    },
    { timeout: 15000 });

    res.status(201).json({
      success: true,
      message: 'Waiting area created successfully.',
      data: { waitingArea },
    });
  } catch (error) {
    // Handle known errors
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get waiting areas
 * GET /api/waiting-areas
 * 
 * All authenticated staff (ADMIN, STAFF including doctors)
 * 
 * Query params (optional):
 * - facility: string
 * - floor: string
 * - includeInactive: string ('true' to include inactive areas)
 * 
 * Returns: Array of waiting areas
 */
export const getWaitingAreas = async (req, res, next) => {
  try {
    const user = req.user;
    const { facility, floor, includeInactive } = req.query;

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Build where clause
    const where = {
      hospitalId: user.hospitalId,
    };

    // Filter by active status (default: only active)
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    // Apply facility filter if provided
    if (facility && facility.trim()) {
      where.facility = facility.trim();
    }

    // Apply floor filter if provided
    if (floor && floor.trim()) {
      where.floor = floor.trim();
    }

    // Fetch waiting areas
    const waitingAreas = await prisma.waitingArea.findMany({
      where,
      orderBy: {
        name: 'asc',
      },
    });

    // Calculate occupancy for each waiting area using efficient groupBy query
    const waitingAreaOccupancyByArea = await prisma.queueEntry.groupBy({
      by: ['waitingAreaId'],
      _count: {
        id: true,
      },
      where: {
        hospitalId: user.hospitalId,
        waitingAreaId: {
          not: null,
        },
        status: {
          in: ['WAITING', 'TRIAGE', 'CALLED'],
        },
      },
    });

    // Build occupancy map for quick lookup
    const occupancyMap = new Map();
    waitingAreaOccupancyByArea.forEach((row) => {
      if (row.waitingAreaId) {
        occupancyMap.set(row.waitingAreaId, row._count.id || 0);
      }
    });

    // Add occupancy to each waiting area
    const waitingAreasWithOccupancy = waitingAreas.map((area) => ({
      id: area.id,
      name: area.name,
      floor: area.floor,
      facility: area.facility,
      capacity: area.capacity,
      isActive: area.isActive,
      isDefault: area.isDefault,
      hospitalId: area.hospitalId,
      createdAt: area.createdAt,
      updatedAt: area.updatedAt,
      currentOccupancy: occupancyMap.get(area.id) || 0,
    }));

    res.status(200).json({
      success: true,
      data: { waitingAreas: waitingAreasWithOccupancy },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update waiting area
 * PATCH /api/waiting-areas/:id
 * 
 * Admin or Primary Staff only endpoint
 * 
 * Body: {
 *   name?: string
 *   capacity?: number (must be > 0)
 *   floor?: string
 *   facility?: string
 *   isActive?: boolean
 * }
 * 
 * Validates:
 * - Hospital ownership
 * - Composite uniqueness (if name is changing)
 * - Capacity reduction (cannot reduce below current occupancy)
 * 
 * Returns: Updated waiting area object
 */
export const updateWaitingArea = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { name, capacity, floor, facility, isActive, isDefault } = req.body;

    // Validate user is ADMIN or Primary
    const isAdmin = user && user.role === 'ADMIN';
    const isPrimary = user && user.isPrimary === true;
    
    if (!isAdmin && !isPrimary) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role or Primary staff required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    // Wrap in transaction for atomicity (extend timeout for hosted DB latency)
    const result = await prisma.$transaction(
      async (tx) => {
      // Find waiting area and verify ownership
      const waitingArea = await tx.waitingArea.findUnique({
        where: { id },
      });

      if (!waitingArea) {
        throw new Error('Waiting area not found.');
      }

      // Verify hospital ownership
      if (waitingArea.hospitalId !== user.hospitalId) {
        throw new Error('Access denied. Waiting area does not belong to your hospital.');
      }

      // Build update data
      const updateData = {};

      // Update name if provided
      if (name !== undefined) {
        if (!name || !name.trim()) {
          throw new Error('Waiting area name cannot be empty.');
        }

        // Check composite uniqueness if name is changing
        if (name.trim() !== waitingArea.name) {
          const existingWaitingArea = await tx.waitingArea.findFirst({
            where: {
              hospitalId: user.hospitalId,
              name: name.trim(),
              id: { not: id }, // Exclude current waiting area
            },
          });

          if (existingWaitingArea) {
            throw new Error('A waiting area with this name already exists in your hospital.');
          }
        }

        updateData.name = name.trim();
      }

      // Update capacity if provided
      if (capacity !== undefined) {
        const capacityNum = parseInt(capacity, 10);
        if (isNaN(capacityNum) || capacityNum <= 0) {
          throw new Error('Capacity must be a positive integer.');
        }

        // If capacity is being reduced, check current occupancy
        if (capacityNum < waitingArea.capacity) {
          const currentOccupancy = await tx.queueEntry.count({
            where: {
              waitingAreaId: id,
              status: {
                in: ['WAITING', 'TRIAGE', 'CALLED'],
              },
            },
          });

          if (currentOccupancy > capacityNum) {
            throw new Error(
              `Cannot reduce capacity to ${capacityNum}. Currently ${currentOccupancy} patients are assigned to this waiting area.`
            );
          }
        }

        updateData.capacity = capacityNum;
      }

      // Update floor if provided
      if (floor !== undefined) {
        updateData.floor = floor?.trim() || null;
      }

      // Update facility if provided
      if (facility !== undefined) {
        updateData.facility = facility?.trim() || null;
      }

      // Update isActive if provided
      if (isActive !== undefined) {
        updateData.isActive = isActive === true || isActive === 'true';
      }

      // Handle isDefault update
      if (isDefault !== undefined) {
        const shouldBeDefault = isDefault === true || isDefault === 'true';
        
        if (shouldBeDefault) {
          // Setting this to default: unset all other defaults in hospital
          await tx.waitingArea.updateMany({
            where: {
              hospitalId: user.hospitalId,
              isDefault: true,
              id: { not: id }, // Exclude current waiting area
            },
            data: {
              isDefault: false,
            },
          });
          updateData.isDefault = true;
        } else {
          // Setting to false: just update this one, don't auto-select another
          updateData.isDefault = false;
        }
      }

      // If no updates, return existing waiting area
      if (Object.keys(updateData).length === 0) {
        return waitingArea;
      }

      // Update waiting area
      const updatedWaitingArea = await tx.waitingArea.update({
        where: { id },
        data: updateData,
      });

      return updatedWaitingArea;
    },
    { timeout: 15000 });

    res.status(200).json({
      success: true,
      message: 'Waiting area updated successfully.',
      data: { waitingArea: result },
    });
  } catch (error) {
    // Handle known errors
    if (error.message === 'Waiting area not found.') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === 'Access denied. Waiting area does not belong to your hospital.' ||
      error.message.includes('already exists') ||
      error.message.includes('Cannot reduce capacity') ||
      error.message.includes('cannot be empty') ||
      error.message.includes('must be a positive integer')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Pass other errors to error handler
    next(error);
  }
};
