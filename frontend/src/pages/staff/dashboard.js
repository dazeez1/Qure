/**
 * Staff Dashboard - Auth & View Initialization
 * Handles authentication and view-specific logic
 */

'use strict';

import { io } from 'socket.io-client';
import { apiGet, apiPost, apiPatch, getApiBaseUrl } from '../../utils/apiClient.js';
import { getAuthUser, setAuthUser, clearAuth, isAuthenticated, getAuthToken } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { cleanupPage } from '../../utils/pageLifecycle.js';

const PAGE_ID = 'dashboard';
let viewLoadedHandler = null;
let dashboardPollingIntervalId = null;
let queueSocket = null;

const CACHE_KEY_DASHBOARD = 'qure_dashboard_cache';
const CACHE_KEY_QUEUE = 'qure_queue_cache';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Close all open modals
 */
function closeAllModals() {
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => {
    try {
      modal.classList.remove('modal-show');
      modal.classList.add('modal-hide');
      setTimeout(() => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 100);
    } catch (error) {
      // Modal might already be removed
    }
  });
  document.body.style.overflow = '';
}

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

// Guard: Check if user is verified (for STAFF role only)
// Primary staff and ADMIN are auto-verified, but regular STAFF need to verify access code
if (user.role === 'STAFF' && !user.isPrimary && !user.isVerified) {
  // Not verified - redirect to access code page immediately
  // Don't show toast here to avoid multiple notifications
  window.location.href = '/staff/verify-access.html';
  throw new Error('Not verified'); // Stop execution
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
viewLoadedHandler = async (event) => {
  const { route, view } = event.detail;

  // Initialize dashboard view
  if (route === 'dashboard') {
    // Cleanup previous state
    cleanupPage(PAGE_ID);
    closeAllModals();
    
    await initializeDashboard();
  }

  // Other views can be initialized here as they're created
  // if (route === 'queues') {
  //   await initializeQueues();
  // }
};

window.addEventListener('view-loaded', viewLoadedHandler);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (viewLoadedHandler) {
    window.removeEventListener('view-loaded', viewLoadedHandler);
  }
  cleanupPage(PAGE_ID);
  closeAllModals();
});

// ============================================
// DASHBOARD VIEW INITIALIZATION
// ============================================

function renderFromCache() {
  try {
    const dashboardCached = sessionStorage.getItem(CACHE_KEY_DASHBOARD);
    const queueCached = sessionStorage.getItem(CACHE_KEY_QUEUE);
    const now = Date.now();

    if (dashboardCached) {
      const { data, ts } = JSON.parse(dashboardCached);
      if (now - ts < CACHE_MAX_AGE_MS && data) {
        renderDashboardMetrics(data);
        renderHospitalName(data.hospitalName);
      }
    }
    if (queueCached) {
      const { data, ts } = JSON.parse(queueCached);
      if (now - ts < CACHE_MAX_AGE_MS && data) {
        renderQueueTable(data);
      }
    }
  } catch (_) { /* ignore parse errors */ }
}

function updateDoctorDropdownFromContext(userContext) {
  if (!userContext || !userContext.isDoctor || !userContext.departmentId) return;
  const dropdown = document.getElementById('department-select');
  if (!dropdown) return;

  dropdown.innerHTML = '';
  const option = document.createElement('option');
  option.value = userContext.departmentId;
  option.textContent = userContext.departmentName || 'My Department';
  dropdown.appendChild(option);
  dropdown.value = userContext.departmentId;
  dropdown.disabled = true;
  dropdown.title = 'Doctors see only their department';

  const currentUser = getAuthUser();
  if (currentUser && currentUser.departmentId !== userContext.departmentId) {
    setAuthUser({ ...currentUser, departmentId: userContext.departmentId });
  }
}

async function initializeDashboard() {
  // Double-check verification status before making any API calls
  const currentUser = getAuthUser();
  if (currentUser && currentUser.role === 'STAFF' && !currentUser.isPrimary && !currentUser.isVerified) {
    // User is not verified - redirect immediately (no API calls)
    window.location.href = '/staff/verify-access.html';
    return;
  }

  // Load stored hospital name and render from cache immediately for fast perceived load
  loadStoredHospitalName();
  renderFromCache();

  // Populate department dropdown first (doctors get correct dept from API userContext when dashboard loads)
  await populateDepartments();

  // Wire up search input with debounce
  setupSearchInput();

  // Setup export data button
  setupExportDataButton();

  // Setup add staff button (same logic as invite staff)
  setupAddStaffButton();

  // Fetch dashboard + queue in parallel (doctors: pass '' – backend uses user.departmentId)
  const departmentFilter = document.getElementById('department-select');
  const initialDepId = (departmentFilter && departmentFilter.value) || '';
  await Promise.all([
    fetchDashboardSummary(initialDepId),
    fetchQueueEntries(initialDepId),
  ]);
  
  // Initialize announcement tabs and create button (immediately, no delay)
  initializeAnnouncementTabs();
  setupAnnouncementCreateButton();

  // Real-time queue updates via Socket.IO
  if (currentUser && currentUser.hospitalId) {
    const socketUrl = new URL(getApiBaseUrl()).origin;
    queueSocket = io(socketUrl);
    queueSocket.emit('joinHospital', currentUser.hospitalId);
    queueSocket.on('queue:update', () => {
      const departmentFilter = document.getElementById('department-select');
      const searchInput = document.getElementById('dashboard-search-input');
      const depId = (departmentFilter && departmentFilter.value) || '';
      const search = (searchInput && searchInput.value.trim()) || '';
      fetchDashboardSummary(depId, search);
      fetchQueueEntries(depId, search);
    });
    queueSocket.on('connect', () => {
      if (dashboardPollingIntervalId) {
        clearInterval(dashboardPollingIntervalId);
        dashboardPollingIntervalId = null;
      }
    });
    queueSocket.on('disconnect', () => {
      startDashboardPollingFallback();
    });
  }

  // Fallback polling when Socket.IO is not connected (15s)
  startDashboardPollingFallback();
}

function startDashboardPollingFallback() {
  if (dashboardPollingIntervalId) return;
  const departmentFilter = document.getElementById('department-select');
  const searchInput = document.getElementById('dashboard-search-input');
  dashboardPollingIntervalId = setInterval(() => {
    if (queueSocket && queueSocket.connected) return;
    const refreshUser = getAuthUser();
    if (refreshUser && refreshUser.role === 'STAFF' && !refreshUser.isPrimary && !refreshUser.isVerified) {
      window.location.href = '/staff/verify-access.html';
      return;
    }
    const depId = (departmentFilter && departmentFilter.value) || '';
    const search = (searchInput && searchInput.value.trim()) || '';
    fetchDashboardSummary(depId, search);
    fetchQueueEntries(depId, search);
  }, 15000);
}

/**
 * Debounce utility function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Setup search input with debounce
 */
function setupSearchInput() {
  const searchInput = document.getElementById('dashboard-search-input');
  const departmentSelect = document.getElementById('department-select');
  
  if (!searchInput || !departmentSelect) return;
  
  searchInput.addEventListener('input', debounce(() => {
    const value = searchInput.value.trim();
    const depId = departmentSelect.value || '';
    
    fetchDashboardSummary(depId, value);
    fetchQueueEntries(depId, value);
  }, 400));
}

/**
 * Populate department dropdown from API
 * Uses /api/settings/departments and only includes ACTIVE departments
 * For doctors: disabled, shows only their department
 */
async function populateDepartments() {
  const dropdown = document.getElementById('department-select');
  if (!dropdown) return;

  const currentUser = getAuthUser();
  const isDoctor =
    currentUser &&
    currentUser.role === 'STAFF' &&
    currentUser.staffRole === 'DOCTOR' &&
    !currentUser.isPrimary;
  const doctorDepartmentId = isDoctor ? currentUser.departmentId : null;

  dropdown.innerHTML = '';
  if (!isDoctor) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select Department';
    dropdown.appendChild(placeholder);
  }

  try {
    const response = await apiGet('/settings/departments');
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to load departments');
    }

    const departments = result.data?.departments || [];

    let activeDepartments = departments.filter(dep => dep.status === 'ACTIVE');
    if (isDoctor && doctorDepartmentId) {
      const docDept = activeDepartments.find(dep => dep.id === doctorDepartmentId);
      activeDepartments = docDept ? [docDept] : activeDepartments;
    }

    activeDepartments.forEach(dep => {
      const option = document.createElement('option');
      option.value = dep.id;
      option.textContent = dep.name;
      dropdown.appendChild(option);
    });

    if (isDoctor) {
      if (doctorDepartmentId && activeDepartments.some(d => d.id === doctorDepartmentId)) {
        dropdown.value = doctorDepartmentId;
      }
      dropdown.disabled = true;
      dropdown.title = 'Doctors see only their department';
    } else {
      dropdown.addEventListener('change', () => {
        const depId = dropdown.value || '';
        fetchDashboardSummary(depId);
        fetchQueueEntries(depId);
      });
    }
  } catch (error) {
    console.error('Department fetch error:', error);
    toast.error('Failed to load departments');
  }
}

/**
 * Fetch dashboard summary from API
 * @param {string} departmentId - Optional department filter
 * @param {string} search - Optional search query
 */
async function fetchDashboardSummary(departmentId = '', search = '') {
  // Check verification status before making API call
  const currentUser = getAuthUser();
  if (currentUser && currentUser.role === 'STAFF' && !currentUser.isPrimary && !currentUser.isVerified) {
    // User is not verified - don't make API call, redirect instead
    window.location.href = '/staff/verify-access.html';
    return;
  }

  try {
    const query = new URLSearchParams();
    if (departmentId) query.append('departmentId', departmentId);
    if (search) query.append('search', search);

    const queryString = query.toString();
    const endpoint = `/staff/dashboard${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiGet(endpoint);
    const result = await response.json();

    if (!response.ok || !result.success) {
      // Check if it's a 403 verification error
      if (response.status === 403 && (result.message === 'Hospital access code required' || result.message?.includes('access code'))) {
        // Redirect to verify access page without showing toast
        window.location.href = '/staff/verify-access.html';
        return;
      }
      throw new Error(result.message || 'Failed to load dashboard data');
    }

    const data = result.data;
    const { userContext, ...metricsData } = data;

    if (userContext) {
      updateDoctorDropdownFromContext(userContext);
    }

    renderDashboardMetrics(metricsData);
    renderHospitalName(data.hospitalName);

    try {
      sessionStorage.setItem(
        CACHE_KEY_DASHBOARD,
        JSON.stringify({ data: metricsData, ts: Date.now() })
      );
    } catch (_) { /* ignore */ }
  } catch (error) {
    // Check if it's a verification error
    if (error.message?.includes('access code') || error.message?.includes('Access denied')) {
      // Redirect to verify access page without showing toast
      window.location.href = '/staff/verify-access.html';
      return;
    }
    console.error('Dashboard fetch error:', error);
    toast.error('Failed to load dashboard data');
  }
}

/**
 * Render dashboard metrics dynamically
 * @param {Object} data - Dashboard data from API
 */
function renderDashboardMetrics(data) {
  // Queue Length (waiting + triage + called, excluding inConsultation)
  const queueTotal =
    (data.queueCounts?.WAITING || 0) +
    (data.queueCounts?.TRIAGE || 0) +
    (data.queueCounts?.CALLED || 0);

  const queueLengthEl = document.getElementById('metric-queue-length');
  if (queueLengthEl) queueLengthEl.textContent = queueTotal;

  // No Shows Today
  const noShowsEl = document.getElementById('metric-no-shows');
  if (noShowsEl) {
    noShowsEl.textContent = data.noShowsToday || 0;
  }

  // Average Wait Time (always show; 0 if null/undefined)
  const avgWaitEl = document.getElementById('metric-avg-wait');
  if (avgWaitEl) {
    const avg = data.averageWaitTimeToday ?? 0;
    avgWaitEl.textContent = `${avg} mins`;
  }

  // Occupancy Calculation from waitingAreaStats
  let totalCapacity = 0;
  let totalOccupied = 0;

  if (data.waitingAreaStats && data.waitingAreaStats.length > 0) {
    data.waitingAreaStats.forEach(area => {
      totalCapacity += area.capacity || 0;
      totalOccupied += area.currentOccupancy || 0;
    });
  }

  const occupancy = totalCapacity > 0
    ? Math.round((totalOccupied / totalCapacity) * 100)
    : 0;

  const occupancyEl = document.getElementById('metric-occupancy');
  if (occupancyEl) {
    occupancyEl.textContent = `${occupancy}%`;
  }
}

/**
 * Render hospital name
 * @param {string} hospitalName - Hospital name from API
 */
function renderHospitalName(hospitalName) {
  const hospitalNameEl = document.getElementById('hospital-name-text');
  if (hospitalNameEl) {
    if (hospitalName) {
      hospitalNameEl.textContent = hospitalName;
      // Store in localStorage for persistence
      localStorage.setItem('hospitalName', hospitalName);
      } else {
      // Try to load from localStorage if API didn't return it
      const storedName = localStorage.getItem('hospitalName');
      if (storedName) {
        hospitalNameEl.textContent = storedName;
      }
    }
  }
}

/**
 * Load hospital name from storage on page load
 */
function loadStoredHospitalName() {
  const hospitalNameEl = document.getElementById('hospital-name-text');
  if (hospitalNameEl) {
    const storedName = localStorage.getItem('hospitalName');
    if (storedName) {
      hospitalNameEl.textContent = storedName;
    }
  }
}

/**
 * Fetch queue entries from API
 * @param {string} departmentId - Optional department filter
 * @param {string} search - Optional search query
 */
async function fetchQueueEntries(departmentId = '', search = '') {
  // Check verification status before making API call
  const currentUser = getAuthUser();
  if (currentUser && currentUser.role === 'STAFF' && !currentUser.isPrimary && !currentUser.isVerified) {
    // User is not verified - don't make API call, redirect instead
    window.location.href = '/staff/verify-access.html';
    return;
  }

  try {
    const query = new URLSearchParams();
    if (departmentId) query.append('departmentId', departmentId);
    if (search) query.append('search', search);
    // Add pagination - limit to 7 for dashboard preview
    query.append('page', '1');
    query.append('limit', '7');

    const queryString = query.toString();
    const endpoint = `/staff/queue${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiGet(endpoint);
    const result = await response.json();

    if (!response.ok || !result.success) {
      // Check if it's a 403 verification error
      if (response.status === 403 && (result.message === 'Hospital access code required' || result.message?.includes('access code'))) {
        // Redirect to verify access page without showing toast
        window.location.href = '/staff/verify-access.html';
        return;
      }
      throw new Error(result.message || 'Failed to load queue entries');
    }

    renderQueueTable(result.data);

    try {
      sessionStorage.setItem(
        CACHE_KEY_QUEUE,
        JSON.stringify({ data: result.data, ts: Date.now() })
      );
    } catch (_) { /* ignore */ }
  } catch (error) {
    // Check if it's a verification error
    if (error.message?.includes('access code') || error.message?.includes('Access denied')) {
      // Redirect to verify access page without showing toast
      window.location.href = '/staff/verify-access.html';
      return;
    }
    console.error('Queue fetch error:', error);
    toast.error('Failed to load queue entries');
  }
}

/**
 * Render queue table with data from /api/staff/queue
 * @param {Object} data - Queue data with queueEntries and pagination
 * Structure: { queueEntries: [...], pagination: {...} }
 */
function renderQueueTable(data) {
  const tbody = document.getElementById('dashboard-queue-body');
  if (!tbody) return;

  // Response structure: { success: true, data: { queueEntries: [...], pagination: {...} } }
  const entries = data.queueEntries || [];

  if (!entries || entries.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-queue-row">
        <td colspan="5" class="empty-queue-message">No queue entries</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = entries.map(entry => {
    const patientName = entry.patient?.fullName || 'Unknown';
    const departmentName = entry.department?.name || 'Unknown';
    const ticketNumber = entry.ticketNumber || '-';
    const status = entry.status || 'WAITING';
    
    // Use backend-calculated wait time (not elapsed time)
    let waitTimeDisplay = '-';
    if (entry.waitTimeDisplay) {
      waitTimeDisplay = entry.waitTimeDisplay;
    } else if (status === 'IN_CONSULTATION') {
      waitTimeDisplay = 'Now Serving';
    } else if (status === 'CALLED') {
      waitTimeDisplay = 'Next';
    } else if (status === 'WAITING' || status === 'TRIAGE') {
      waitTimeDisplay = 'Calculating...';
    }

    // Status badge styling
    const statusClass = status.toLowerCase().replace('_', '-');
    const statusLabel = status.replace('_', ' ');

    return `
      <tr>
        <td>${escapeHtml(patientName)}</td>
        <td>${escapeHtml(ticketNumber)}</td>
        <td>${escapeHtml(departmentName)}</td>
        <td><span class="status-badge status-${statusClass}">${escapeHtml(statusLabel)}</span></td>
        <td>${escapeHtml(waitTimeDisplay)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Setup add staff button handler
 * Same logic as invite staff - navigates to settings page
 * Disabled for regular staff, enabled for admin/primary
 */
function setupAddStaffButton() {
  const addStaffBtn = document.querySelector('.btn-add-staff');
  if (!addStaffBtn) return;

  const currentUser = getAuthUser();
  
  // Check if user can manage staff (same permission check as invite staff)
  const canManageStaff = currentUser && (currentUser.isPrimary === true || currentUser.role === 'ADMIN');

  if (!canManageStaff) {
    // Disable button for regular staff (same styling as invite staff)
    addStaffBtn.disabled = true;
    addStaffBtn.style.opacity = '0.5';
    addStaffBtn.style.cursor = 'not-allowed';
    addStaffBtn.title = 'Only primary staff or administrators can invite staff';
  } else {
    // Enable button and navigate to settings page on click
    addStaffBtn.disabled = false;
    addStaffBtn.style.opacity = '1';
    addStaffBtn.style.cursor = 'pointer';
    addStaffBtn.title = '';
    
    addStaffBtn.addEventListener('click', async () => {
      // Navigate to settings page using SPA router
      try {
        const { loadView } = await import('../../js/navigation.js');
        if (loadView) {
          // Load settings view
          await loadView('settings');
          
          // Wait for settings view to load, then load staff-roles tab
          const handleSettingsLoaded = async (event) => {
            if (event.detail.route === 'settings') {
              // Wait a bit for settings navigation to initialize
              setTimeout(async () => {
                try {
                  const { loadSettingsTab } = await import('../../js/settings-navigation.js');
                  if (loadSettingsTab) {
                    loadSettingsTab('staff-roles');
                  }
                } catch (error) {
                  console.error('Failed to load staff-roles tab:', error);
                }
              }, 300);
              
              // Remove listener after handling
              window.removeEventListener('view-loaded', handleSettingsLoaded);
            }
          };
          
          window.addEventListener('view-loaded', handleSettingsLoaded);
        }
      } catch (error) {
        console.error('Failed to navigate to settings:', error);
        // Fallback to hash navigation
        window.location.hash = 'settings';
      }
    });
  }
}

/**
 * Setup export data button handler
 * Downloads hospital data as CSV
 */
function setupExportDataButton() {
  const exportBtn = document.querySelector('.btn-export-data');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', async () => {
    try {
      // Disable button during export
      exportBtn.disabled = true;
      exportBtn.textContent = 'Exporting...';

      // Get optional days parameter from URL or use default
      const urlParams = new URLSearchParams(window.location.search);
      const days = urlParams.get('days') || '7';

      // Call export endpoint using relative path
      const response = await apiGet(`/staff/export?days=${days}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Export failed' }));
        throw new Error(errorData.message || `Export failed: ${response.status}`);
      }

      // Get CSV content
      const csvContent = await response.text();

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'hospital-export.csv';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error.message || 'Failed to export data');
    } finally {
      // Re-enable button
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export Data';
    }
  });
}

/**
 * Initialize announcement panel tabs
 */
function initializeAnnouncementTabs() {
  const tabs = document.querySelectorAll('.announcement-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

/**
 * Create a new announcement
 * @param {Object} payload - Announcement data (title, content, audience, priority)
 */
async function createAnnouncement(payload) {
  try {
    const response = await apiPost('/announcements', payload);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to create announcement');
    }

    // Show success message with recipient count if available
    const emailResult = result.data?.emailResult;
    if (emailResult && emailResult.totalRecipients > 0) {
      const audienceLabel = payload.audience === 'STAFF' 
        ? 'staff members' 
        : payload.audience === 'PATIENT' 
        ? 'patients' 
        : 'recipients';
      
      const successMessage = `Announcement sent to ${emailResult.successCount} ${audienceLabel}`;
      toast.success(successMessage);
      
      // Log if some emails failed
      if (emailResult.failedCount > 0) {
        console.warn(`[Announcement] ${emailResult.failedCount} email(s) failed to send`);
      }
    } else {
      // Fallback message if email result not available
      toast.success('Announcement created successfully');
    }
  } catch (error) {
    console.error('Create announcement error:', error);
    toast.error(error.message || 'Failed to create announcement');
  }
}

/**
 * Setup announcement create button handler
 * Only visible for ADMIN or PRIMARY users
 */
function setupAnnouncementCreateButton() {
  const createBtn = document.querySelector('.btn-create-announcement');
  const textarea = document.getElementById('announcement-textarea');
  const currentUser = getAuthUser();

  if (!createBtn || !textarea) return;

  // Check if user can create announcements
  const canCreate = currentUser && (currentUser.role === 'ADMIN' || currentUser.isPrimary === true);

  if (!canCreate) {
    // Keep button visible but disabled for better UX (no flash)
    createBtn.disabled = true;
    createBtn.style.opacity = '0.5';
    createBtn.style.cursor = 'not-allowed';
    createBtn.title = 'Only administrators can create announcements';
    textarea.disabled = true;
    textarea.placeholder = 'Only administrators can create announcements';
    textarea.style.cursor = 'not-allowed';
    textarea.style.opacity = '0.6';
    return;
  }

  // Enable button and textarea for admin/primary users
  createBtn.disabled = false;
  createBtn.style.opacity = '1';
  createBtn.style.cursor = 'pointer';
  createBtn.title = '';
  createBtn.style.display = 'block'; // Ensure it's visible
  textarea.disabled = false;
  textarea.placeholder = 'Write announcement...';
  textarea.style.cursor = 'text';
  textarea.style.opacity = '1';

  // Remove existing listeners (if any) and add new one
  const newBtn = createBtn.cloneNode(true);
  createBtn.parentNode.replaceChild(newBtn, createBtn);

  newBtn.addEventListener('click', async () => {
    const content = textarea.value.trim();
    
    if (!content) {
      toast.error('Please enter announcement content');
      return;
    }

    // Get active tab to determine audience
    const activeTab = document.querySelector('.announcement-tab.active');
    const tabType = activeTab?.dataset.tab || 'patient';
    const audience = tabType === 'staff' ? 'STAFF' : 'PATIENT';

    // Extract title from first line, rest is content
    const lines = content.split('\n').filter(line => line.trim());
    const title = lines[0]?.trim() || 'Announcement';
    const announcementContent = lines.length > 1 
      ? lines.slice(1).join('\n').trim() 
      : title; // If only one line, use it as both title and content

    const payload = {
      title: title,
      content: announcementContent,
      audience: audience,
      priority: 'NORMAL',
    };

    await createAnnouncement(payload);
    textarea.value = '';
  });
}

// Note: Verification check is now done at the top of the file
// and in each API call function to prevent unnecessary API calls
