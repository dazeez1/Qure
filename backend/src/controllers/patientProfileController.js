import prisma from '../config/database.js';
import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

/**
 * GET /api/patient/me
 * Get current authenticated patient profile
 */
export const getPatientProfile = async (req, res, next) => {
  try {
    const patient = req.patient;

    // Return patient data (excluding password)
    res.status(200).json({
      success: true,
      message: 'Patient profile retrieved successfully',
      data: {
        id: patient.id,
        fullName: patient.fullName,
        email: patient.email,
        phone: patient.phone || null,
        gender: patient.gender || null,
        dateOfBirth: patient.dateOfBirth || null,
        avatarUrl: patient.avatarUrl || null,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/patient/profile
 * Update patient profile (phone and gender only)
 * Email and fullName are NOT editable
 */
export const updatePatientProfile = async (req, res, next) => {
  try {
    const patientId = req.patient.id;
    const { phone, gender } = req.body;

    // Validation
    const errors = [];

    // Phone validation (if provided)
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        errors.push('Phone must be a string');
      } else {
        const cleanPhone = phone.trim().replace(/\s+/g, '');
        
        // Count only digits for length validation
        const digitsOnly = cleanPhone.replace(/\D/g, '');
        
        // Accept formats: +234..., 0..., or international format
        // Allow starting with +, 0, or digits
        // Minimum 10 digits total, max 15
        if (digitsOnly.length < 10 || digitsOnly.length > 15) {
          errors.push('Phone number must be between 10 and 15 digits');
        } else {
          // More flexible regex: accepts +234, 0, or international formats
          const phoneRegex = /^(\+?234|0|\+?[1-9])?[0-9]{7,14}$/;
          if (!phoneRegex.test(cleanPhone)) {
            errors.push('Invalid phone number format');
          }
        }
      }
    }

    // Gender validation (if provided)
    if (gender !== undefined) {
      const validGenders = ['MALE', 'FEMALE', 'OTHER'];
      if (typeof gender !== 'string' || !validGenders.includes(gender.toUpperCase())) {
        errors.push('Gender must be one of: MALE, FEMALE, OTHER');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    // Build update data object
    const updateData = {};
    if (phone !== undefined) {
      updateData.phone = phone.trim().replace(/\s+/g, '');
    }
    if (gender !== undefined) {
      updateData.gender = gender.toUpperCase();
    }

    // If no fields to update, return current patient
    if (Object.keys(updateData).length === 0) {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          gender: true,
          dateOfBirth: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'No changes to update',
        data: patient,
      });
    }

    // Update patient
    const updatedPatient = await prisma.patient.update({
      where: { id: patientId },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        gender: true,
        dateOfBirth: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedPatient,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/patient/avatar
 * Upload patient avatar image to Cloudinary
 * Accepts: jpeg, png, jpg
 * Max size: 2MB
 */
export const uploadPatientAvatar = async (req, res, next) => {
  try {
    const patientId = req.patient.id;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Get current patient to check for existing avatar
    const currentPatient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { avatarUrl: true },
    });

    // Delete old avatar from Cloudinary if it exists
    if (currentPatient?.avatarUrl && currentPatient.avatarUrl.includes('cloudinary.com')) {
      try {
        // Extract public_id from Cloudinary URL
        // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{format}
        const urlParts = currentPatient.avatarUrl.split('/');
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1 && uploadIndex < urlParts.length - 1) {
          // Get the path after 'upload' (version/public_id.format)
          const pathAfterUpload = urlParts.slice(uploadIndex + 1).join('/');
          // Remove version and extension to get public_id
          const parts = pathAfterUpload.split('/');
          if (parts.length >= 2) {
            // Has version: v1234567890/qure/avatars/patient-xxx-xxx
            const publicIdWithExt = parts.slice(1).join('/');
            const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
            await cloudinary.uploader.destroy(publicId);
          } else {
            // No version: qure/avatars/patient-xxx-xxx.format
            const publicId = pathAfterUpload.replace(/\.[^/.]+$/, '');
            await cloudinary.uploader.destroy(publicId);
          }
        }
      } catch (error) {
        console.error('Error deleting old avatar from Cloudinary:', error);
        // Continue even if deletion fails
      }
    }

    // Convert buffer to stream for Cloudinary upload
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'qure/avatars',
        public_id: `patient-${patientId}-${Date.now()}`,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      async (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to upload avatar to cloud storage',
            error: error.message,
          });
        }

        try {
          // Update patient with Cloudinary URL
          const updatedPatient = await prisma.patient.update({
            where: { id: patientId },
            data: { avatarUrl: result.secure_url },
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              gender: true,
              dateOfBirth: true,
              avatarUrl: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          res.status(200).json({
            success: true,
            message: 'Avatar uploaded successfully',
            data: {
              avatarUrl: updatedPatient.avatarUrl,
              patient: updatedPatient,
            },
          });
        } catch (dbError) {
          console.error('Database update error:', dbError);
          // Try to delete uploaded image from Cloudinary if DB update fails
          try {
            await cloudinary.uploader.destroy(result.public_id);
          } catch (deleteError) {
            console.error('Error cleaning up Cloudinary upload:', deleteError);
          }
          return res.status(500).json({
            success: false,
            message: 'Failed to update profile with avatar URL',
          });
        }
      }
    );

    // Pipe the file buffer to Cloudinary
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(stream);
  } catch (error) {
    next(error);
  }
};
