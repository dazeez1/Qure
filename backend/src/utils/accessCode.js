import crypto from 'crypto';

/**
 * Generate a random access code for hospitals
 * Format: 8-character uppercase hexadecimal string
 * Example: "A1B2C3D4"
 * @returns {string} - Generated access code
 */
export const generateAccessCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

