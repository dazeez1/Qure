/**
 * Authentication utilities
 * Handles JWT token storage and retrieval
 */

const TOKEN_KEY = 'qure_auth_token';
const USER_KEY = 'qure_auth_user';

/**
 * Store authentication token in localStorage
 * @param {string} token - JWT token
 */
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
};

/**
 * Get authentication token from localStorage
 * @returns {string|null} - JWT token or null
 */
export const getAuthToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Store user data in localStorage
 * @param {Object} user - User object
 */
export const setAuthUser = (user) => {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
};

/**
 * Get user data from localStorage
 * @returns {Object|null} - User object or null
 */
export const getAuthUser = () => {
  const userStr = localStorage.getItem(USER_KEY);
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  }
  return null;
};

/**
 * Check if user is authenticated
 * @returns {boolean} - True if token exists
 */
export const isAuthenticated = () => {
  return !!getAuthToken();
};

/**
 * Clear authentication data (logout)
 */
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

/**
 * Get Authorization header value
 * @returns {string|null} - Authorization header value or null
 */
export const getAuthHeader = () => {
  const token = getAuthToken();
  return token ? `Bearer ${token}` : null;
};

