/**
 * API Configuration
 * Centralized API base URL configuration
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const API_ENDPOINTS = {
  auth: {
    register: `${API_BASE_URL}/auth/register`, // Staff registration
    login: `${API_BASE_URL}/auth/login`,
    forgotPassword: `${API_BASE_URL}/auth/forgot-password`,
    resetPassword: `${API_BASE_URL}/auth/reset-password`,
  },
  patientAuth: {
    register: `${API_BASE_URL}/patient/auth/register`, // Patient registration
    login: `${API_BASE_URL}/patient/auth/login`, // Patient login
  },
  settings: {
    getOrganization: `${API_BASE_URL}/settings/organization`,
    updateOrganization: `${API_BASE_URL}/settings/organization`,
  },
};

export default API_BASE_URL;

