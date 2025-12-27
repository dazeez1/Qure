/**
 * Email validation utility
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Password validation utility
 * Password must:
 * - Be at least 8 characters
 * - Contain at least one uppercase letter
 * - Contain at least one lowercase letter
 * - Contain at least one number
 * - Contain at least one special character
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password meets requirements
 */
export const isValidPassword = (password) => {
  if (!password || password.length < 8) {
    return false;
  }

  // Regex pattern: at least one lowercase, one uppercase, one number, one special char, min 8 chars
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Validate required fields
 * @param {Object} data - Data object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @returns {Object} - { isValid: boolean, missingFields: string[] }
 */
export const validateRequiredFields = (data, requiredFields) => {
  const missingFields = requiredFields.filter((field) => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
};

/**
 * Normalize email to lowercase
 * @param {string} email - Email to normalize
 * @returns {string} - Normalized email
 */
export const normalizeEmail = (email) => {
  return email.toLowerCase().trim();
};

