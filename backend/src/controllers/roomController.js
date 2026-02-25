import prisma from '../config/database.js';

/**
 * Create a new room
 * POST /api/rooms
 * 
 * Admin only endpoint
 * 
 * Body: {
 *   name: string (required)
 *   departmentId: string (required)
 * }
 * 
 * Validates:
 * - Department ownership (belongs to admin's hospital)
 * - Composite uniqueness (hospitalId, departmentId, name)
 * 
 * Returns: Created room object
 */
export const createRoom = async (req, res, next) => {
  try {
    const user = req.user;
    const { name, departmentId } = req.body;

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
        message: 'Room name is required.',
      });
    }

    if (!departmentId) {
      return res.status(400).json({
        success: false,
        message: 'Department ID is required.',
      });
    }

    // Wrap in transaction
    const room = await prisma.$transaction(async (tx) => {
      // Validate department ownership (belongs to admin's hospital)
      const department = await tx.department.findFirst({
        where: {
          id: departmentId,
          hospitalId: user.hospitalId,
        },
        select: {
          id: true,
          name: true,
          hospitalId: true,
        },
      });

      if (!department) {
        throw new Error('Department not found or does not belong to your hospital.');
      }

      // Check composite uniqueness (hospitalId, departmentId, name)
      const existingRoom = await tx.room.findFirst({
        where: {
          hospitalId: user.hospitalId,
          departmentId: departmentId,
          name: name.trim(),
        },
      });

      if (existingRoom) {
        throw new Error(
          `Room with name "${name.trim()}" already exists in this department.`
        );
      }

      // Create room
      const newRoom = await tx.room.create({
        data: {
          name: name.trim(),
          hospitalId: user.hospitalId,
          departmentId: departmentId,
          isActive: true,
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
      });

      return newRoom;
    });

    res.status(201).json({
      success: true,
      message: 'Room created successfully.',
      data: {
        room: room,
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get rooms
 * GET /api/rooms
 * 
 * Admin + Doctor access
 * Hospital scoped
 * 
 * Query parameters:
 *   - departmentId: string (optional, filter by department)
 *   - includeInactive: boolean (optional, default: false - only active rooms by default)
 * 
 * Returns: Array of rooms
 */
export const getRooms = async (req, res, next) => {
  try {
    const user = req.user;

    // Validate user is STAFF or ADMIN
    if (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff or Admin role required.',
      });
    }

    // Validate hospital association
    if (!user.hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital association required.',
      });
    }

    const { departmentId, includeInactive } = req.query;

    // Build where clause
    const where = {
      hospitalId: user.hospitalId, // Always hospital-scoped
    };

    // Optional department filter
    if (departmentId) {
      // Validate department belongs to hospital
      const department = await prisma.department.findFirst({
        where: {
          id: departmentId,
          hospitalId: user.hospitalId,
        },
        select: { id: true },
      });

      if (!department) {
        return res.status(404).json({
          success: false,
          message: 'Department not found or does not belong to your hospital.',
        });
      }

      where.departmentId = departmentId;
    }

    // Default: only active rooms (unless includeInactive is true)
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    // Get rooms
    const rooms = await prisma.room.findMany({
      where,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            shortCode: true,
          },
        },
      },
      orderBy: [
        { department: { name: 'asc' } },
        { name: 'asc' },
      ],
    });

    res.status(200).json({
      success: true,
      message: 'Rooms retrieved successfully.',
      data: {
        rooms: rooms,
        count: rooms.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update room
 * PATCH /api/rooms/:id
 * 
 * Admin only endpoint
 * 
 * Body: {
 *   name: string (optional)
 *   isActive: boolean (optional)
 * }
 * 
 * Validates:
 * - Room ownership (belongs to admin's hospital)
 * - Composite uniqueness (if name is changed)
 * 
 * Returns: Updated room object
 */
export const updateRoom = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { name, isActive } = req.body;

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

    // Validate at least one field to update
    if (name === undefined && isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (name or isActive) must be provided for update.',
      });
    }

    // Wrap in transaction
    const room = await prisma.$transaction(async (tx) => {
      // Find room and validate ownership
      const existingRoom = await tx.room.findUnique({
        where: { id },
        include: {
          department: {
            select: {
              id: true,
              name: true,
              hospitalId: true,
            },
          },
        },
      });

      if (!existingRoom) {
        throw new Error('Room not found.');
      }

      // Validate hospital ownership
      if (existingRoom.hospitalId !== user.hospitalId) {
        throw new Error('Access denied. Room does not belong to your hospital.');
      }

      // Build update data
      const updateData = {};

      // Update name if provided
      if (name !== undefined) {
        if (!name || !name.trim()) {
          throw new Error('Room name cannot be empty.');
        }

        const trimmedName = name.trim();

        // Check composite uniqueness if name is changing
        if (trimmedName !== existingRoom.name) {
          const duplicateRoom = await tx.room.findFirst({
            where: {
              hospitalId: user.hospitalId,
              departmentId: existingRoom.departmentId,
              name: trimmedName,
              id: { not: id }, // Exclude current room
            },
          });

          if (duplicateRoom) {
            throw new Error(
              `Room with name "${trimmedName}" already exists in this department.`
            );
          }
        }

        updateData.name = trimmedName;
      }

      // Update isActive if provided
      if (isActive !== undefined) {
        if (typeof isActive !== 'boolean') {
          throw new Error('isActive must be a boolean value.');
        }
        updateData.isActive = isActive;
      }

      // Update room
      const updatedRoom = await tx.room.update({
        where: { id },
        data: updateData,
        include: {
          department: {
            select: {
              id: true,
              name: true,
              shortCode: true,
            },
          },
        },
      });

      return updatedRoom;
    });

    res.status(200).json({
      success: true,
      message: 'Room updated successfully.',
      data: {
        room: room,
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};
