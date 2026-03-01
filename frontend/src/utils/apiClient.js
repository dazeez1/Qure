/**
 * API Client utility
 * Automatically attaches authentication token to requests
 * Handles 401 (auto-logout) and 403 (toast) errors centrally
 * Supports request cancellation via AbortController
 */

import { getAuthToken, clearAuth } from './auth.js';
import { toast } from './toast.js';

const BASE_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Global request controllers map (key: requestId, value: AbortController)
const activeControllers = new Map();

/**
 * Create a new AbortController for a request
 * @param {string} requestId - Unique identifier for the request
 * @returns {AbortController} - New AbortController
 */
export function createRequestController(requestId) {
  // Cancel previous request with same ID if exists
  if (activeControllers.has(requestId)) {
    activeControllers.get(requestId).abort();
  }
  
  const controller = new AbortController();
  activeControllers.set(requestId, controller);
  return controller;
}

/**
 * Cancel a specific request
 * @param {string} requestId - Request identifier
 */
export function cancelRequest(requestId) {
  if (activeControllers.has(requestId)) {
    activeControllers.get(requestId).abort();
    activeControllers.delete(requestId);
  }
}

/**
 * Cancel all active requests
 */
export function cancelAllRequests() {
  activeControllers.forEach((controller) => {
    controller.abort();
  });
  activeControllers.clear();
}

/**
 * Remove a request controller (after completion)
 * @param {string} requestId - Request identifier
 */
export function removeRequestController(requestId) {
  activeControllers.delete(requestId);
}

/**
 * Make an authenticated API request
 * Automatically includes Authorization header if token exists
 * Handles 401 (auto-logout) and 403 (toast) errors
 * 
 * @param {string} endpoint - API endpoint (relative to /api)
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} - Fetch response
 */
export const apiRequest = async (endpoint, options = {}) => {
  const url = `${BASE_API_URL}${endpoint}`;
  
  // Get auth token
  const token = getAuthToken();
  
  // Set default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add Authorization header if token exists
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  // Merge options
  const fetchOptions = {
    ...options,
    headers,
  };
  
  // Make request with error handling for aborted requests
  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    // Handle aborted requests gracefully
    if (error.name === 'AbortError') {
      // Throw a special error that can be caught and ignored by callers
      const abortError = new Error('Request aborted');
      abortError.name = 'AbortError';
      abortError.isAborted = true;
      throw abortError;
    }
    throw error;
  }
  
  // Handle 401 Unauthorized - Auto-logout
  if (response.status === 401) {
    // Clear auth data
    clearAuth();
    
    // Show toast
    let errorMessage = 'Session expired. Please log in again.';
    try {
      const responseClone = response.clone();
      const result = await responseClone.json();
      if (result.message) {
        errorMessage = result.message;
      }
    } catch (e) {
      // If response is not JSON, use default message
    }
    
    toast.error(errorMessage);
    
    // Redirect to login (only if not already on login page)
    if (!window.location.pathname.includes('login.html')) {
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1500);
    }
    
    // Return response so caller can handle if needed
    return response;
  }
  
  // Handle 403 Forbidden - Show toast (no redirect)
  if (response.status === 403) {
    let errorMessage = 'Access denied. You do not have permission to access this resource.';
    try {
      const responseClone = response.clone();
      const result = await responseClone.json();
      if (result.message) {
        errorMessage = result.message;
      }
    } catch (e) {
      // If response is not JSON, use default message
    }
    
    // Show toast (no redirect for 403)
    toast.error(errorMessage);
    
    // Return response so caller can handle if needed
    return response;
  }
  
  // Return response for other status codes
  return response;
};

/**
 * GET request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Additional fetch options (can include signal for AbortController)
 * @returns {Promise<Response>}
 */
export const apiGet = (endpoint, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'GET',
  });
};

/**
 * POST request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export const apiPost = (endpoint, body, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  });
};

/**
 * PUT request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export const apiPut = (endpoint, body, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  });
};

/**
 * PATCH request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export const apiPatch = (endpoint, body, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

/**
 * DELETE request helper
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>}
 */
export const apiDelete = (endpoint, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'DELETE',
  });
};

