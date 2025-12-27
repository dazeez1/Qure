/**
 * Patient Dashboard
 * Verifies patient role access and loads dashboard
 */

'use strict';

import { apiGet } from '../../utils/apiClient.js';
import { getAuthUser, clearAuth, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// Check authentication first
if (!isAuthenticated()) {
  toast.error('Please log in to access the dashboard');
  window.location.href = '/login.html';
}

// Get user data
const user = getAuthUser();

// Display user name
const userNameElement = document.getElementById('user-name');
if (userNameElement && user) {
  userNameElement.textContent = `${user.firstName} ${user.lastName}`;
}

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

// Verify access to patient dashboard
const verifyAccess = async () => {
  const statusElement = document.getElementById('dashboard-status');
  
  try {
    const response = await apiGet('/patient/dashboard');
    const result = await response.json();

    if (response.ok && result.success) {
      if (statusElement) {
        statusElement.textContent = 'Access granted! Dashboard loaded.';
        statusElement.style.color = '#10b981';
      }
    } else {
      // Access denied or error
      if (response.status === 403) {
        toast.error('Access denied. You do not have permission to access this dashboard.');
      } else if (response.status === 401) {
        toast.error('Session expired. Please log in again.');
        clearAuth();
      } else {
        toast.error(result.message || 'Access denied');
      }
      
      if (statusElement) {
        statusElement.textContent = 'Access denied. Redirecting...';
        statusElement.style.color = '#ef4444';
      }
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 2000);
    }
  } catch (error) {
    console.error('Dashboard access error:', error);
    toast.error('Failed to load dashboard. Please try again.');
    
    if (statusElement) {
      statusElement.textContent = 'Error loading dashboard. Redirecting...';
      statusElement.style.color = '#ef4444';
    }
    
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 2000);
  }
};

// Verify access on page load
verifyAccess();

