/**
 * Staff Dashboard - Auth & View Initialization
 * Handles authentication and view-specific logic
 */

'use strict';

import { apiGet } from '../../utils/apiClient.js';
import { getAuthUser, clearAuth, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// ============================================
// AUTH GUARD - Initialize Once
// ============================================

// Check authentication first
if (!isAuthenticated()) {
  toast.error('Please log in to access the dashboard');
  window.location.href = '/login.html';
  throw new Error('Not authenticated'); // Stop execution
}

// Get user data
const user = getAuthUser();

// Guard: Must be STAFF role
if (!user || user.role !== 'STAFF') {
  toast.error('Access denied');
  window.location.href = '/login.html';
  throw new Error('Invalid role'); // Stop execution
}

// ============================================
// INITIALIZE UI - Run Once
// ============================================

// Logout functionality
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    clearAuth();
    toast.success('Logged out successfully');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1000);
  });
}

// ============================================
// VIEW-SPECIFIC INITIALIZATION
// ============================================

// Listen for view-loaded events to initialize view-specific code
window.addEventListener('view-loaded', async (event) => {
  const { route, view } = event.detail;

  // Initialize dashboard view
  if (route === 'dashboard') {
    await initializeDashboard();
  }

  // Other views can be initialized here as they're created
  // if (route === 'queues') {
  //   await initializeQueues();
  // }
});

// ============================================
// DASHBOARD VIEW INITIALIZATION
// ============================================

async function initializeDashboard() {
  const statusElement = document.getElementById('dashboard-status');
  const userNameInView = document.getElementById('user-name');
  
  // Update user name in view if element exists
  if (userNameInView && user) {
    userNameInView.textContent = `${user.firstName} ${user.lastName}`;
  }

  if (!statusElement) return;

  try {
    const response = await apiGet('/staff/dashboard');
    const result = await response.json();

    if (response.ok && result.success) {
      statusElement.textContent = 'Dashboard loaded successfully.';
      statusElement.className = 'status-message success';
    } else {
      // Handle errors
      if (response.status === 403) {
        if (result.message === 'Hospital access code required') {
          toast.error('Enter hospital access code to continue');
          setTimeout(() => {
            window.location.href = '/staff/verify-access.html';
          }, 1500);
          return;
        }
        toast.error('Access denied. You do not have permission to access this dashboard.');
      } else if (response.status === 401) {
        toast.error('Session expired. Please log in again.');
        clearAuth();
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 1500);
        return;
      } else {
        toast.error(result.message || 'Access denied');
      }

      statusElement.textContent = 'Access denied.';
      statusElement.className = 'status-message error';
    }
  } catch (error) {
    console.error('Dashboard access error:', error);
    toast.error('Failed to load dashboard. Please try again.');
    
    if (statusElement) {
      statusElement.textContent = 'Error loading dashboard. Please try again.';
      statusElement.className = 'status-message error';
    }
  }
}

// ============================================
// INITIAL VERIFICATION
// ============================================

// Verify access to staff dashboard on initial load
const verifyInitialAccess = async () => {
  try {
    const response = await apiGet('/staff/dashboard');
    const result = await response.json();

    if (!response.ok || !result.success) {
      if (response.status === 403 && result.message === 'Hospital access code required') {
        toast.error('Enter hospital access code to continue');
        setTimeout(() => {
          window.location.href = '/staff/verify-access.html';
        }, 1500);
        return;
      }
      
      if (response.status === 401) {
        toast.error('Session expired. Please log in again.');
        clearAuth();
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 1500);
        return;
      }
    }
  } catch (error) {
    console.error('Initial access verification error:', error);
    // Don't block the app, but log the error
  }
};

// Run initial verification
verifyInitialAccess();
