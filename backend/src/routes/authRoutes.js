import express from 'express';
import { register, login } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user (Patient or Staff)
 * Public route - no authentication required
 */
router.post('/register', register);

/**
 * POST /api/auth/login
 * Login user (Patient or Staff)
 * Public route - no authentication required
 */
router.post('/login', login);

/**
 * GET /api/auth/me
 * Get current authenticated user
 * Protected route - requires authentication
 */
router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'User authenticated',
    data: {
      user: req.user,
    },
  });
});

export default router;

