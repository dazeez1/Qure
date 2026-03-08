import multer from 'multer';

// File filter for avatar uploads
const fileFilter = (req, file, cb) => {
  // Accept only jpeg, jpg, png
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error('Invalid file type. Only JPEG, JPG, and PNG images are allowed.'),
      false
    );
  }
};

// Configure multer to use memory storage (for Cloudinary upload)
// Files will be stored in memory temporarily before uploading to Cloudinary
const storage = multer.memoryStorage();

// Configure multer
export const uploadAvatar = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
  },
  fileFilter: fileFilter,
});
