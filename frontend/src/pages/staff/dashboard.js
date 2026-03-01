/**
 * Staff Dashboard - Auth & View Initialization
 * Handles authentication and view-specific logic
 */

'use strict';

import { apiGet, apiPost, apiPatch, createRequestController, cancelRequest } from '../../utils/apiClient.js';
import { getAuthUser, clearAuth, isAuthenticated, getAuthToken } from '../../utils/auth.js';
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

/**
 * Update URL parameters with current filters
 * @param {string} departmentId - Current department filter
 * @param {string} search - Current search filter
 */
function updateDashboardURLParams(departmentId = '', search = '') {
  const params = new URLSearchParams();
  
  if (departmentId) params.set('departmentId', departmentId);
  if (search) params.set('search', search);
  
  // Update hash without triggering navigation
  const newHash = `dashboard${params.toString() ? `?${params.toString()}` : ''}`;
  if (window.location.hash !== `#${newHash}`) {
    window.history.replaceState(null, '', `#${newHash}`);
  }
}

/**
 * Read URL parameters and return filters
 * @returns {Object} - { departmentId, search }
 */
function readDashboardURLParams() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#dashboard')) {
    return { departmentId: '', search: '' };
  }
  
  const hashParts = hash.split('?');
  if (hashParts.length < 2) {
    return { departmentId: '', search: '' };
  }
  
  const params = new URLSearchParams(hashParts[1]);
  
  return {
    departmentId: params.get('departmentId') || '',
    search: params.get('search') || ''
  };
}

/**
 * Apply filters from URL to UI elements
 * @param {Object} filters - Filters to apply
 */
function applyDashboardFiltersToUI(filters) {
  // Apply department filter
  const departmentSelect = document.getElementById('department-select');
  if (departmentSelect && filters.departmentId) {
    departmentSelect.value = filters.departmentId;
  }
  
  // Apply search input
  const searchInput = document.getElementById('dashboard-search-input');
  if (searchInput && filters.search) {
    searchInput.value = filters.search;
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

  // Load stored hospital name immediately (before API call)
  loadStoredHospitalName();
  
  // Populate department dropdown on load
  await populateDepartments();

  // Read filters from URL params
  const urlFilters = readDashboardURLParams();
  
  // Apply URL filters to UI
  if (urlFilters.departmentId || urlFilters.search) {
    applyDashboardFiltersToUI(urlFilters);
  }

  // Wire up search input with debounce
  setupSearchInput();

  // Setup export data button
  setupExportDataButton();

  // Setup add staff button (same logic as invite staff)
  setupAddStaffButton();

  // Fetch dashboard data on initialization (with URL params if they exist)
  const departmentFilter = document.getElementById('department-select');
  const searchInput = document.getElementById('dashboard-search-input');
  const depId = (urlFilters.departmentId || (departmentFilter && departmentFilter.value)) || '';
  const search = (urlFilters.search || (searchInput && searchInput.value.trim())) || '';
  
  await fetchDashboardSummary(depId, search);
  
  // Fetch queue entries separately
  await fetchQueueEntries(depId, search);
  
  // Initialize announcement tabs and create button (immediately, no delay)
  initializeAnnouncementTabs();
  setupAnnouncementCreateButton();

  // Set up auto-refresh every 15 seconds (keeps filters applied)
  // Reuse departmentFilter and searchInput variables already declared above
  
  // Store interval ID for cleanup
  if (window.dashboardInterval) {
    clearInterval(window.dashboardInterval);
  }
  
  window.dashboardInterval = setInterval(() => {
    // Check verification status before each auto-refresh
    const refreshUser = getAuthUser();
    if (refreshUser && refreshUser.role === 'STAFF' && !refreshUser.isPrimary && !refreshUser.isVerified) {
      // User became unverified - redirect
      window.location.href = '/staff/verify-access.html';
      return;
    }
    
    const depId = departmentFilter.value || '';
    const search = searchInput.value.trim();
    
    fetchDashboardSummary(depId, search);
    fetchQueueEntries(depId, search);
  }, 15000);
}

// Track debounced search timeout for cleanup
let dashboardSearchTimeout = null;

/**
 * Debounce utility function (cancelable)
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function with cancel method
 */
function debounce(func, wait) {
  let timeout;
  const debounced = function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      timeout = null;
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    // Store timeout reference for cleanup
    if (func.name === 'executedFunction' || arguments.callee.caller?.name === 'setupSearchInput') {
      dashboardSearchTimeout = timeout;
    }
  };
  // Add cancel method
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      dashboardSearchTimeout = null;
    }
  };
  return debounced;
}

// Store debounced search function reference for cleanup
let debouncedSearchHandler = null;

/**
 * Setup search input with debounce
 */
function setupSearchInput() {
  const searchInput = document.getElementById('dashboard-search-input');
  const departmentSelect = document.getElementById('department-select');
  
  if (!searchInput || !departmentSelect) return;
  
  // Remove old listener if exists
  if (debouncedSearchHandler) {
    searchInput.removeEventListener('input', debouncedSearchHandler);
    debouncedSearchHandler.cancel?.();
  }
  
  // Create new debounced handler
  debouncedSearchHandler = debounce(() => {
    const value = searchInput.value.trim();
    const depId = departmentSelect.value || '';
    
    fetchDashboardSummary(depId, value);
    fetchQueueEntries(depId, value);
  }, 400);
  
  searchInput.addEventListener('input', debouncedSearchHandler);
}

/**
 * Populate department dropdown from API
 * Uses /api/settings/departments and only includes ACTIVE departments
 */
async function populateDepartments() {
  const dropdown = document.getElementById('department-select');
  if (!dropdown) return;

  // Always reset to a clean placeholder option
  dropdown.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select Department';
  dropdown.appendChild(placeholder);

  try {
    const response = await apiGet('/settings/departments');
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to load departments');
    }

    const departments = result.data?.departments || [];

    departments
      .filter(dep => dep.status === 'ACTIVE')
      .forEach(dep => {
        const option = document.createElement('option');
        option.value = dep.id;
        option.textContent = dep.name;
        dropdown.appendChild(option);
      });

    // Listen for changes to refetch dashboard + queue
    dropdown.addEventListener('change', () => {
      const depId = dropdown.value || '';
      fetchDashboardSummary(depId);
      fetchQueueEntries(depId);
    });
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
/**
 * Show skeleton loader in dashboard metrics
 */
function showDashboardMetricsSkeleton() {
  const metricsContainer = document.querySelector('.dashboard-metrics');
  if (!metricsContainer) return;
  
  metricsContainer.innerHTML = `
    <div class="metric-card">
      <div class="skeleton skeleton-metric"></div>
    </div>
    <div class="metric-card">
      <div class="skeleton skeleton-metric"></div>
    </div>
    <div class="metric-card">
      <div class="skeleton skeleton-metric"></div>
    </div>
    <div class="metric-card">
      <div class="skeleton skeleton-metric"></div>
    </div>
  `;
}

/**
 * Show skeleton loader in dashboard queue table
 */
function showDashboardQueueSkeleton() {
  const queueTableBody = document.querySelector('#dashboard-queue-table-body');
  if (!queueTableBody) return;
  
  const skeletonRows = 8; // Show 8 skeleton rows for dashboard preview
  const fragment = document.createDocumentFragment();
  
  for (let i = 0; i < skeletonRows; i++) {
    const row = document.createElement('tr');
    row.className = 'skeleton-row';
    row.innerHTML = `
      <td class="skeleton-cell">
        <div class="skeleton skeleton-text-short"></div>
      </td>
      <td class="skeleton-cell">
        <div class="skeleton skeleton-text-medium"></div>
      </td>
      <td class="skeleton-cell">
        <div class="skeleton skeleton-badge"></div>
      </td>
      <td class="skeleton-cell">
        <div class="skeleton skeleton-text-short"></div>
      </td>
    `;
    fragment.appendChild(row);
  }
  
  queueTableBody.innerHTML = '';
  queueTableBody.appendChild(fragment);
}

async function fetchDashboardSummary(departmentId = '', search = '') {
  // Check verification status before making API call
  const currentUser = getAuthUser();
  if (currentUser && currentUser.role === 'STAFF' && !currentUser.isPrimary && !currentUser.isVerified) {
    // User is not verified - don't make API call, redirect instead
    window.location.href = '/staff/verify-access.html';
    return;
  }

  // Show skeleton loader
  showDashboardMetricsSkeleton();

  try {
    const query = new URLSearchParams();
    if (departmentId) query.append('departmentId', departmentId);
    if (search) query.append('search', search);

    const queryString = query.toString();
    const endpoint = `/staff/dashboard${queryString ? `?${queryString}` : ''}`;
    
    // Cancel previous request if exists
    cancelRequest('dashboard-summary');
    
    // Create new controller for this request
    const controller = createRequestController('dashboard-summary');
    
    const response = await apiGet(endpoint, { signal: controller.signal });
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
    renderDashboardMetrics(data);
    renderHospitalName(data.hospitalName);
    // Queue table is handled separately by fetchQueueEntries()
  } catch (error) {
    // Ignore aborted requests
    if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
      return; // Request was cancelled, don't show error
    }
    
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

  // Average Wait Time
  const avgWaitEl = document.getElementById('metric-avg-wait');
  if (avgWaitEl) {
    if (data.averageWaitTimeToday !== null && data.averageWaitTimeToday !== undefined) {
      avgWaitEl.textContent = `${data.averageWaitTimeToday} mins`;
    } else {
      avgWaitEl.textContent = '0 mins';
    }
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

  // Show skeleton loader
  showDashboardQueueSkeleton();

  try {
    const query = new URLSearchParams();
    if (departmentId) query.append('departmentId', departmentId);
    if (search) query.append('search', search);
    // Add pagination - limit to 8 for dashboard preview
    query.append('page', '1');
    query.append('limit', '8');

    const queryString = query.toString();
    const endpoint = `/staff/queue${queryString ? `?${queryString}` : ''}`;
    
    // Cancel previous request if exists
    cancelRequest('dashboard-queue');
    
    // Create new controller for this request
    const controller = createRequestController('dashboard-queue');
    
    const response = await apiGet(endpoint, { signal: controller.signal });
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

    // Response structure: { success: true, data: { queueEntries: [...], pagination: {...} } }
    renderQueueTable(result.data);
  } catch (error) {
    // Ignore aborted requests
    if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
      return; // Request was cancelled, don't show error
    }
    
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

  // Use DocumentFragment for smooth updates (no flicker)
  const fragment = document.createDocumentFragment();

  if (!entries || entries.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty-queue-row';
    emptyRow.innerHTML = `<td colspan="6" class="empty-queue-message">No queue entries</td>`;
    fragment.appendChild(emptyRow);
  } else {
    entries.forEach(entry => {
      const patientName = entry.patient?.fullName || 'Unknown';
      const departmentName = entry.department?.name || 'Unknown';
      const ticketNumber = entry.ticketNumber || '-';
      const status = entry.status || 'WAITING';
      
      // Calculate wait time (minutes since checkInTime)
      const waitTime = entry.checkInTime 
        ? Math.floor((new Date() - new Date(entry.checkInTime)) / 60000)
        : 0;

      // Status badge styling
      const statusClass = status.toLowerCase().replace('_', '-');
      const statusLabel = status.replace('_', ' ');

      const rowHTML = `
        <td>${escapeHtml(patientName)}</td>
        <td>${escapeHtml(ticketNumber)}</td>
        <td>${escapeHtml(departmentName)}</td>
        <td><span class="status-badge status-${statusClass}">${escapeHtml(statusLabel)}</span></td>
        <td>${waitTime} mins</td>
        <td>
          <button class="action-btn" title="View Details">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
        </td>
      `;
      
      const row = document.createElement('tr');
      row.innerHTML = rowHTML;
      fragment.appendChild(row);
    });
  }

  // Clear and update table in one operation (no flicker)
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
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

      // Get auth token
      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Use BASE_API_URL from apiClient
      const BASE_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

      // Call export endpoint
      const response = await fetch(`${BASE_API_URL}/staff/export?days=${days}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

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

    toast.success('Announcement created');
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

// Cleanup function for SPA navigation
function cleanupDashboard() {
  if (window.dashboardInterval) {
    clearInterval(window.dashboardInterval);
    window.dashboardInterval = null;
  }
  
  // Cancel any pending requests
  cancelRequest('dashboard-summary');
  cancelRequest('dashboard-queue');
  
  // Clear search timeout
  if (dashboardSearchTimeout) {
    clearTimeout(dashboardSearchTimeout);
    dashboardSearchTimeout = null;
  }
  
  // Cancel debounced search handler
  if (debouncedSearchHandler) {
    debouncedSearchHandler.cancel?.();
    debouncedSearchHandler = null;
  }
  
  // Remove search input listener
  const searchInput = document.getElementById('dashboard-search-input');
  if (searchInput && debouncedSearchHandler) {
    searchInput.removeEventListener('input', debouncedSearchHandler);
  }
}

// Export cleanup function for SPA navigation
export { cleanupDashboard };

// Note: Verification check is now done at the top of the file
// and in each API call function to prevent unnecessary API calls
