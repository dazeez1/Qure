/**
 * Staff Dashboard - Auth & View Initialization
 * Handles authentication and view-specific logic
 */

'use strict';

import { apiGet } from '../../utils/apiClient.js';
import { getAuthUser, clearAuth, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { API_ENDPOINTS } from '../../config/api.js';

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

// Guard: Must be STAFF or ADMIN role (ADMIN is a type of staff)
if (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN')) {
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
  const userNameInView = document.getElementById('user-name');
  const loadingElement = document.getElementById('dashboard-loading');
  const errorElement = document.getElementById('dashboard-error');
  const contentElement = document.getElementById('dashboard-content');
  const errorMessage = document.getElementById('error-message');
  
  // Update user name in view if element exists
  if (userNameInView && user) {
    userNameInView.textContent = `${user.firstName} ${user.lastName}`;
  }

  // Show loading, hide content and error
  if (loadingElement) loadingElement.classList.remove('hidden');
  if (contentElement) contentElement.classList.add('hidden');
  if (errorElement) errorElement.classList.add('hidden');

  try {
    const response = await apiGet('/staff/dashboard-summary');
    const result = await response.json();

    if (response.ok && result.success) {
      // Hide loading, show content
      if (loadingElement) loadingElement.classList.add('hidden');
      if (contentElement) {
        contentElement.classList.remove('hidden');
        renderDashboardData(result.data);
      }
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
        toast.error(result.message || 'Failed to load dashboard');
      }

      // Show error state
      if (loadingElement) loadingElement.classList.add('hidden');
      if (errorElement) {
        if (errorMessage) errorMessage.textContent = result.message || 'Please try refreshing the page.';
        errorElement.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.error('Dashboard access error:', error);
    toast.error('Failed to load dashboard. Please try again.');
    
    // Show error state
    if (loadingElement) loadingElement.classList.add('hidden');
    if (errorElement) {
      if (errorMessage) errorMessage.textContent = 'Network error. Please check your connection and try again.';
      errorElement.classList.remove('hidden');
    }
  }
}

/**
 * Render dashboard data
 */
function renderDashboardData(data) {
  // Queue status
  if (data.queue) {
    document.getElementById('stat-waiting').textContent = data.queue.waiting || 0;
    document.getElementById('stat-triage').textContent = data.queue.triage || 0;
    document.getElementById('stat-called').textContent = data.queue.called || 0;
    document.getElementById('stat-consultation').textContent = data.queue.inConsultation || 0;
  }

  // Today's stats
  if (data.today) {
    document.getElementById('stat-completed').textContent = data.today.completed || 0;
    document.getElementById('stat-no-shows').textContent = data.today.noShows || 0;
    
    const avgWait = data.today.averageWaitTimeToday;
    const avgWaitElement = document.getElementById('stat-avg-wait');
    if (avgWait !== null && avgWait !== undefined) {
      avgWaitElement.textContent = `${avgWait} min`;
    } else {
      avgWaitElement.textContent = 'N/A';
    }
  }

  // Doctor status
  if (data.doctors) {
    document.getElementById('stat-active-doctors').textContent = data.doctors.active || 0;
    document.getElementById('stat-overloaded').textContent = data.doctors.overloaded || 0;
  }

  // Waiting areas
  const waitingAreasList = document.getElementById('waiting-areas-list');
  if (waitingAreasList && data.waitingAreas) {
    if (data.waitingAreas.length === 0) {
      waitingAreasList.innerHTML = '<p class="empty-state">No waiting areas configured.</p>';
    } else {
      waitingAreasList.innerHTML = data.waitingAreas.map(area => `
        <div class="info-card">
          <div class="info-card-header">
            <h3>${area.name}</h3>
            <span class="capacity-badge ${area.currentOccupancy >= area.capacity ? 'full' : ''}">
              ${area.currentOccupancy}/${area.capacity}
            </span>
          </div>
          <div class="info-card-content">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.min((area.currentOccupancy / area.capacity) * 100, 100)}%"></div>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // Rooms
  const roomsList = document.getElementById('rooms-list');
  if (roomsList && data.rooms) {
    if (data.rooms.length === 0) {
      roomsList.innerHTML = '<p class="empty-state">No rooms configured.</p>';
    } else {
      roomsList.innerHTML = data.rooms.map(room => `
        <div class="info-card">
          <div class="info-card-header">
            <h3>${room.name}</h3>
            <span class="status-badge ${room.occupied ? 'occupied' : 'available'}">
              ${room.occupied ? 'Occupied' : 'Available'}
            </span>
          </div>
        </div>
      `).join('');
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
