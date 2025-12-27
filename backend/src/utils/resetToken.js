import crypto from 'crypto';

/**
 * Generate a secure password reset token
 * Format: 32-character hexadecimal string
 * @returns {string} - Generated reset token
 */
export const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

