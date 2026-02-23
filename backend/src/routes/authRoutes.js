import express from 'express';
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  acceptInvite,
} from '../controllers/authController.js';
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
 * POST /api/auth/forgot-password
 * Generate reset token and send password reset email
 * Public route - no authentication required
 */
router.post('/forgot-password', forgotPassword);

/**
 * POST /api/auth/reset-password
 * Verify reset token and update password
 * Public route - no authentication required
 */
router.post('/reset-password', resetPassword);

/**
 * POST /api/auth/accept-invite
 * Verify invite token, set password, and activate user
 * Public route - no authentication required
 */
router.post('/accept-invite', acceptInvite);

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

