/**
 * API Configuration
 * Centralized API base URL configuration
 * 
 * Usage:
 * - ALWAYS use relative paths with apiClient functions (apiGet, apiPost, apiPatch, etc.)
 * - Example: apiGet('/auth/login'), apiPost('/patient/auth/register', data)
 * - The apiClient.js automatically prepends the base URL to relative paths
 * 
 * Note: This file is kept for reference only. All API calls should use apiClient.js functions
 * with relative paths instead of direct fetch() calls.
 */

// Internal use only - apiClient.js uses this
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

/**
 * API Endpoints Reference (for documentation only)
 * All API calls should use apiClient functions with relative paths:
 * - apiGet('/auth/login')
 * - apiPost('/patient/auth/register', data)
 * - apiPatch('/queue/123/status', { status: 'CALLED' })
 */
export const API_ENDPOINTS = {
  auth: {
    register: '/auth/register', // Staff registration
    login: '/auth/login',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    acceptInvite: '/auth/accept-invite',
  },
  patientAuth: {
    register: '/patient/auth/register', // Patient registration
    login: '/patient/auth/login', // Patient login
  },
  settings: {
    getOrganization: '/settings/organization',
    updateOrganization: '/settings/organization',
  },
  staff: {
    getQueue: '/staff/queue',
    getDashboardSummary: '/staff/dashboard-summary',
    appointments: '/staff/appointments',
  },
  queue: {
    updateStatus: (id) => `/queue/${id}/status`,
  },
  rooms: {
    list: '/rooms',
  },
  waitingAreas: {
    list: '/waiting-areas',
  },
};

export default API_BASE_URL;

