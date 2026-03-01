/**
 * Staff Appointments Page
 * Handles appointment listing, filtering, and details display
 */

import { apiGet, apiPost, apiPatch, createRequestController, cancelRequest } from '../../utils/apiClient.js';
import { isAuthenticated, getAuthUser } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { API_ENDPOINTS } from '../../config/api.js';

// State
let appointmentsState = [];
let selectedAppointmentId = null;
let currentPage = 1;
let currentFilters = {};
let searchTimeout = null; // Global timeout for cleanup

// Store handlers for cleanup on re-initialization
let dateRangeClickHandler = null;
let outsideClickHandler = null;
let applyDateHandler = null;
let clearDateHandler = null;
let departmentChangeHandler = null;
let searchInputHandler = null;
let searchKeypressHandler = null;
let searchBtnHandler = null;

/**
 * Fetch appointments from API
 * @param {Object} filters - Filter parameters
 * @param {number} page - Page number
 */
/**
 * Show skeleton loader in appointments table
 */
function showAppointmentsSkeleton() {
  const tbody = document.getElementById('appointments-table-body');
  if (!tbody) return;
  
  const skeletonRows = 10; // Show 10 skeleton rows
  const fragment = document.createDocumentFragment();
  
  for (let i = 0; i < skeletonRows; i++) {
    const row = document.createElement('tr');
    row.className = 'skeleton-row';
    row.innerHTML = `
      <td class="skeleton-cell">
        <div class="skeleton skeleton-text-medium"></div>
      </td>
      <td class="skeleton-cell">
        <div class="skeleton skeleton-text-short"></div>
      </td>
      <td class="skeleton-cell">
        <div class="skeleton skeleton-text-medium"></div>
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
  
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

async function fetchAppointments(filters = {}, page = 1) {
  // Show skeleton loader
  showAppointmentsSkeleton();
  
  try {
    const user = getAuthUser();
    if (!user || !user.hospitalId) {
      toast.error('Hospital ID not found');
      return;
    }

    // Build query params
    const params = new URLSearchParams();
    
    // Add filters
    if (filters.status) params.append('status', filters.status);
    if (filters.departmentId) params.append('departmentId', filters.departmentId);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.search) params.append('search', filters.search);
    
    // Add pagination
    params.append('page', page.toString());
    params.append('limit', '10');

    const queryString = params.toString();
    const endpoint = `/staff/appointments${queryString ? `?${queryString}` : ''}`;

    // Cancel previous request if exists
    cancelRequest('appointments-fetch');
    
    // Create new controller for this request
    const controller = createRequestController('appointments-fetch');
    
    const response = await apiGet(endpoint, { signal: controller.signal });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch appointments');
    }

    // Store state
    appointmentsState = result.data.appointments || [];
    currentPage = page;
    currentFilters = filters;
    
    // Update URL with current filters
    updateURLParams(filters, page);

    // Clear selection when page changes (selected appointment might not be on new page)
    if (selectedAppointmentId) {
      const stillExists = appointmentsState.some(apt => apt.id === selectedAppointmentId);
      if (!stillExists) {
        selectedAppointmentId = null;
        const sidebar = document.getElementById('appointment-details-sidebar');
        const contentContainer = document.querySelector('.appointments-content');
        if (sidebar) sidebar.classList.remove('visible');
        if (contentContainer) contentContainer.classList.remove('sidebar-visible');
      }
    }

    // Render
    renderAppointments();
    renderPagination(result.data.pagination);

  } catch (error) {
    // Ignore aborted requests
    if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
      return; // Request was cancelled, don't show error
    }
    
    console.error('Error fetching appointments:', error);
    toast.error(error.message || 'Failed to load appointments');
    appointmentsState = [];
    renderAppointments();
        renderPagination({ page: 1, limit: 10, totalCount: 0, totalPages: 0 });
  }
}

/**
 * Render appointments table
 */
function renderAppointments() {
  const tbody = document.getElementById('appointments-table-body');
  if (!tbody) return;

  // Use DocumentFragment for smooth updates (no flicker)
  const fragment = document.createDocumentFragment();

  // Handle empty state
  if (appointmentsState.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="6" class="empty-state">
        No appointments found
      </td>
    `;
    fragment.appendChild(emptyRow);
  } else {
    // Render each appointment
    appointmentsState.forEach((appointment) => {
      const row = createAppointmentRow(appointment);
      fragment.appendChild(row);
    });
  }

  // Clear and update table in one operation (no flicker)
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

/**
 * Create appointment table row
 * @param {Object} appointment - Appointment data
 * @returns {HTMLElement} - Table row element
 */
function createAppointmentRow(appointment) {
  const row = document.createElement('tr');
  row.dataset.appointmentId = appointment.id;
  
  if (selectedAppointmentId === appointment.id) {
    row.classList.add('selected');
  }

  // Patient name
  const patientName = appointment.patient?.fullName || '-';
  
  // Doctor name (from queueEntry or assignedDoctor)
  let doctorName = '-';
  if (appointment.queueEntry?.assignedDoctor) {
    const doctor = appointment.queueEntry.assignedDoctor;
    doctorName = `Dr. ${doctor.firstName} ${doctor.lastName}`;
  }
  
  // Department
  const departmentName = appointment.department?.name || '-';
  
  // Type (default to "Visit" if not specified)
  const type = appointment.reason || 'Visit';
  
  // Date & Time
  const dateTime = formatDateTime(appointment.appointmentDate);
  
  // Status badge
  const statusBadge = createStatusBadge(appointment.status);

  row.innerHTML = `
    <td>${escapeHtml(patientName)}</td>
    <td>${escapeHtml(doctorName)}</td>
    <td>${escapeHtml(departmentName)}</td>
    <td>${escapeHtml(type)}</td>
    <td>${dateTime}</td>
    <td>${statusBadge}</td>
  `;

  // Add click handler
  row.addEventListener('click', () => {
    selectAppointment(appointment.id);
  });

  return row;
}

/**
 * Create status badge
 * @param {string} status - Appointment status
 * @returns {string} - HTML for status badge
 */
function createStatusBadge(status) {
  const statusMap = {
    'BOOKED': { class: 'booked', text: 'Booked' },
    'CHECKED_IN': { class: 'checked-in', text: 'Checked-in' },
    'MOVED_TO_QUEUE': { class: 'checked-in', text: 'Checked-in' },
    'IN_CONSULTATION': { class: 'checked-in', text: 'In Consultation' },
    'COMPLETED': { class: 'completed', text: 'Completed' },
    'CANCELLED': { class: 'cancelled', text: 'Cancelled' },
    'NO_SHOW': { class: 'no-show', text: 'No-show' },
  };

  const statusInfo = statusMap[status] || { class: 'booked', text: status };
  
  return `<span class="status-badge ${statusInfo.class}">${escapeHtml(statusInfo.text)}</span>`;
}

/**
 * Format date and time
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDateTime(date) {
  if (!date) return '-';
  
  const d = new Date(date);
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  
  return d.toLocaleDateString('en-US', options);
}

/**
 * Select appointment and show details
 * @param {string} id - Appointment ID
 */
function selectAppointment(id) {
  // Toggle selection: if clicking the same appointment, deselect it
  if (selectedAppointmentId === id) {
    selectedAppointmentId = null;
  } else {
    selectedAppointmentId = id;
  }
  
  // Highlight selected row
  const rows = document.querySelectorAll('#appointments-table-body tr');
  rows.forEach(row => {
    if (row.dataset.appointmentId === selectedAppointmentId) {
      row.classList.add('selected');
    } else {
      row.classList.remove('selected');
    }
  });

  // Show/hide sidebar based on selection
  const sidebar = document.getElementById('appointment-details-sidebar');
  const contentContainer = document.querySelector('.appointments-content');
  
  if (sidebar && contentContainer) {
    if (selectedAppointmentId) {
      sidebar.classList.add('visible');
      contentContainer.classList.add('sidebar-visible');
      renderAppointmentDetails();
    } else {
      sidebar.classList.remove('visible');
      contentContainer.classList.remove('sidebar-visible');
    }
  }
}

/**
 * Render appointment details in sidebar
 */
function renderAppointmentDetails() {
  if (!selectedAppointmentId) {
    return;
  }

  const appointment = appointmentsState.find(apt => apt.id === selectedAppointmentId);
  if (!appointment) {
    return;
  }

  // Ensure sidebar is visible
  const sidebar = document.getElementById('appointment-details-sidebar');
  if (sidebar) {
    sidebar.classList.add('visible');
  }

  // Patient info
  const patientNameEl = document.getElementById('detail-patient-name');
  const patientPhoneEl = document.getElementById('detail-patient-phone');
  const patientMrnEl = document.getElementById('detail-patient-mrn');

  if (patientNameEl) {
    patientNameEl.textContent = appointment.patient?.fullName || '-';
  }
  if (patientPhoneEl) {
    patientPhoneEl.textContent = appointment.patient?.phone || '-';
  }
  if (patientMrnEl) {
    patientMrnEl.textContent = `MRN ${appointment.patient?.id?.substring(0, 6) || '-'}`;
  }

  // Appointment details
  const timeEl = document.getElementById('detail-time');
  const departmentEl = document.getElementById('detail-department');
  const doctorEl = document.getElementById('detail-doctor');
  const notesEl = document.getElementById('detail-notes');

  if (timeEl) {
    timeEl.textContent = formatDateTime(appointment.appointmentDate);
  }
  if (departmentEl) {
    departmentEl.textContent = appointment.department?.name || '-';
  }
  if (doctorEl) {
    if (appointment.queueEntry?.assignedDoctor) {
      const doctor = appointment.queueEntry.assignedDoctor;
      doctorEl.textContent = `Dr. ${doctor.firstName} ${doctor.lastName}`;
    } else {
      doctorEl.textContent = '-';
    }
  }
  if (notesEl) {
    notesEl.textContent = appointment.notes || '-';
  }

  // Notes section
  const notesTextEl = document.getElementById('detail-notes-text');
  if (notesTextEl) {
    notesTextEl.textContent = appointment.notes || 'No notes available.';
  }

  // Update action buttons visibility
  updateActionButtons(appointment);
}

/**
 * Update action buttons visibility based on appointment status
 * @param {Object} appointment - Appointment object
 */
function updateActionButtons(appointment) {
  const checkInBtn = document.getElementById('check-in-btn');
  const noShowBtn = document.getElementById('no-show-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  const now = new Date();
  const appointmentDate = new Date(appointment.appointmentDate);
  const isPastAppointment = appointmentDate < now;
  const isBooked = appointment.status === 'BOOKED';

  // Check-In button: Show if status === BOOKED
  if (checkInBtn) {
    checkInBtn.style.display = isBooked ? 'block' : 'none';
  }

  // No-Show button: Show if status === BOOKED AND appointmentDate < now
  if (noShowBtn) {
    noShowBtn.style.display = (isBooked && isPastAppointment) ? 'block' : 'none';
  }

  // Cancel button: Show if status === BOOKED
  if (cancelBtn) {
    cancelBtn.style.display = isBooked ? 'block' : 'none';
  }
}

/**
 * Render pagination controls
 * @param {Object} pagination - Pagination metadata
 */
function renderPagination(pagination) {
  const container = document.getElementById('appointments-pagination');
  if (!container) return;

  if (!pagination || pagination.totalPages === 0) {
    container.innerHTML = '';
    return;
  }

  const { page, totalPages, totalCount } = pagination;

  container.innerHTML = `
    <button class="pagination-btn" id="prev-page-btn" ${page === 1 ? 'disabled' : ''}>
      Previous
    </button>
    <span class="pagination-info">
      Page ${page} of ${totalPages} (${totalCount} total)
    </span>
    <button class="pagination-btn" id="next-page-btn" ${page === totalPages ? 'disabled' : ''}>
      Next
    </button>
  `;

  // Add event listeners
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (page > 1) {
        fetchAppointments(currentFilters, page - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (page < totalPages) {
        fetchAppointments(currentFilters, page + 1);
      }
    });
  }
}

/**
 * Update URL parameters with current filters
 * @param {Object} filters - Current filter state
 * @param {number} page - Current page number
 */
function updateURLParams(filters = {}, page = 1) {
  const params = new URLSearchParams();
  
  if (filters.status) params.set('status', filters.status);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.search) params.set('search', filters.search);
  if (page > 1) params.set('page', page.toString());
  
  // Update hash without triggering navigation
  const newHash = `appointments${params.toString() ? `?${params.toString()}` : ''}`;
  if (window.location.hash !== `#${newHash}`) {
    window.history.replaceState(null, '', `#${newHash}`);
  }
}

/**
 * Read URL parameters and return filters
 * @returns {Object} - { filters, page }
 */
function readURLParams() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#appointments')) {
    return { filters: {}, page: 1 };
  }
  
  const hashParts = hash.split('?');
  if (hashParts.length < 2) {
    return { filters: {}, page: 1 };
  }
  
  const params = new URLSearchParams(hashParts[1]);
  const filters = {};
  
  if (params.has('status')) filters.status = params.get('status');
  if (params.has('departmentId')) filters.departmentId = params.get('departmentId');
  if (params.has('startDate')) filters.startDate = params.get('startDate');
  if (params.has('endDate')) filters.endDate = params.get('endDate');
  if (params.has('search')) filters.search = params.get('search');
  
  const page = params.has('page') ? parseInt(params.get('page'), 10) : 1;
  
  return { filters, page };
}

/**
 * Apply filters from URL to UI elements
 * @param {Object} filters - Filters to apply
 */
function applyFiltersToUI(filters) {
  // Apply status filter button
  const statusFiltersContainer = document.querySelector('.status-filters');
  if (statusFiltersContainer) {
    const allButtons = statusFiltersContainer.querySelectorAll('.status-filter-btn');
    allButtons.forEach(b => b.classList.remove('active'));
    
    // Determine which filter button should be active based on filters
    if (filters.status === 'CANCELLED') {
      const cancelledBtn = statusFiltersContainer.querySelector('[data-filter="cancelled"]');
      if (cancelledBtn) cancelledBtn.classList.add('active');
    } else if (filters.startDate && filters.endDate) {
      // Check if it's "today" filter
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      
      if (startDate.getTime() === today.getTime() && endDate.getTime() === todayEnd.getTime()) {
        const todayBtn = statusFiltersContainer.querySelector('[data-filter="today"]');
        if (todayBtn) todayBtn.classList.add('active');
      } else {
        // Custom date range - no status button active
      }
    } else if (filters.status === 'BOOKED' && filters.startDate) {
      // Upcoming filter
      const upcomingBtn = statusFiltersContainer.querySelector('[data-filter="upcoming"]');
      if (upcomingBtn) upcomingBtn.classList.add('active');
    } else if (filters.endDate && !filters.startDate) {
      // Past filter
      const pastBtn = statusFiltersContainer.querySelector('[data-filter="past"]');
      if (pastBtn) pastBtn.classList.add('active');
    } else {
      // All filter
      const allBtn = statusFiltersContainer.querySelector('[data-filter="all"]');
      if (allBtn) allBtn.classList.add('active');
    }
  }
  
  // Apply date range inputs
  const startDateInput = document.getElementById('start-date-input');
  const endDateInput = document.getElementById('end-date-input');
  if (startDateInput && filters.startDate) {
    startDateInput.value = filters.startDate.split('T')[0]; // Extract date part
  }
  if (endDateInput && filters.endDate) {
    endDateInput.value = filters.endDate.split('T')[0]; // Extract date part
  }
  
  // Apply department filter
  const departmentSelect = document.getElementById('department-select');
  if (departmentSelect && filters.departmentId) {
    departmentSelect.value = filters.departmentId;
  }
  
  // Apply search input
  const searchInput = document.getElementById('appointments-search-input');
  if (searchInput && filters.search) {
    searchInput.value = filters.search;
  }
}

/**
 * Setup filter event listeners
 */
function setupFilters() {
  // Status filter buttons - use event delegation for clean re-initialization
  const statusFiltersContainer = document.querySelector('.status-filters');
  if (statusFiltersContainer) {
    // Remove any existing listener by cloning the container
    const newContainer = statusFiltersContainer.cloneNode(true);
    statusFiltersContainer.parentNode.replaceChild(newContainer, statusFiltersContainer);
    
    newContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-filter-btn');
      if (!btn) return;
      
      // Remove active class from all
      const allButtons = newContainer.querySelectorAll('.status-filter-btn');
      allButtons.forEach(b => b.classList.remove('active'));
      // Add active to clicked
      btn.classList.add('active');
      
      // Get filter type
      const filterType = btn.dataset.filter || 'all';
      
      // Apply filter logic based on type
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      // Clear previous date/status filters
      currentFilters.status = undefined;
      currentFilters.startDate = undefined;
      currentFilters.endDate = undefined;
      
      switch (filterType) {
        case 'all':
          // No filters - show all
          break;
          
        case 'today':
          // Today → startDate = today 00:00, endDate = today 23:59
          currentFilters.startDate = today.toISOString();
          currentFilters.endDate = todayEnd.toISOString();
          break;
          
        case 'upcoming':
          // Upcoming → appointmentDate > now AND status = BOOKED
          // Use a time slightly in the future to ensure > now (since backend uses gte)
          const futureTime = new Date(now.getTime() + 1000); // Add 1 second to ensure > now
          currentFilters.status = 'BOOKED';
          currentFilters.startDate = futureTime.toISOString();
          currentFilters.endDate = undefined;
          break;
          
        case 'past':
          // Past → appointmentDate < now
          currentFilters.startDate = undefined;
          currentFilters.endDate = now.toISOString();
          break;
          
        case 'cancelled':
          // Cancelled → status = CANCELLED
          currentFilters.status = 'CANCELLED';
          break;
      }
      
      // Reset to page 1 and fetch
      fetchAppointments(currentFilters, 1);
    });
  }

  // Date range dropdown
  const dateRangeBtn = document.getElementById('date-range-btn');
  const dateRangePanel = document.getElementById('date-range-panel');
  const applyDateBtn = document.getElementById('apply-date-btn');
  const clearDateBtn = document.getElementById('clear-date-btn');
  const startDateInput = document.getElementById('start-date-input');
  const endDateInput = document.getElementById('end-date-input');

  if (dateRangeBtn && dateRangePanel) {
    // Remove old handlers if they exist
    if (dateRangeClickHandler) {
      dateRangeBtn.removeEventListener('click', dateRangeClickHandler);
      document.removeEventListener('click', outsideClickHandler);
    }

    // Create new handlers
    dateRangeClickHandler = (e) => {
      e.stopPropagation();
      dateRangePanel.classList.toggle('visible');
    };

    outsideClickHandler = (e) => {
      if (!dateRangePanel.contains(e.target) && !dateRangeBtn.contains(e.target)) {
        dateRangePanel.classList.remove('visible');
      }
    };

    dateRangeBtn.addEventListener('click', dateRangeClickHandler);
    document.addEventListener('click', outsideClickHandler);
  }

  if (applyDateBtn) {
    // Remove old handler if exists
    if (applyDateHandler) {
      applyDateBtn.removeEventListener('click', applyDateHandler);
    }
    
    applyDateHandler = () => {
      const startDate = startDateInput?.value || '';
      const endDate = endDateInput?.value || '';
      
      if (startDate || endDate) {
        currentFilters.startDate = startDate || undefined;
        currentFilters.endDate = endDate || undefined;
      } else {
        currentFilters.startDate = undefined;
        currentFilters.endDate = undefined;
      }
      
      dateRangePanel?.classList.remove('visible');
      fetchAppointments(currentFilters, 1);
    };
    
    applyDateBtn.addEventListener('click', applyDateHandler);
  }

  if (clearDateBtn) {
    // Remove old handler if exists
    if (clearDateHandler) {
      clearDateBtn.removeEventListener('click', clearDateHandler);
    }
    
    clearDateHandler = () => {
      if (startDateInput) startDateInput.value = '';
      if (endDateInput) endDateInput.value = '';
      currentFilters.startDate = undefined;
      currentFilters.endDate = undefined;
      dateRangePanel?.classList.remove('visible');
      fetchAppointments(currentFilters, 1);
    };
    
    clearDateBtn.addEventListener('click', clearDateHandler);
  }

  // Department filter
  const departmentFilter = document.getElementById('department-filter');
  if (departmentFilter) {
    // Remove old handler if exists
    if (departmentChangeHandler) {
      departmentFilter.removeEventListener('change', departmentChangeHandler);
    }
    
    departmentChangeHandler = () => {
      const departmentId = departmentFilter.value || '';
      currentFilters.departmentId = departmentId || undefined;
      fetchAppointments(currentFilters, 1);
    };
    
    departmentFilter.addEventListener('change', departmentChangeHandler);
  }

  // Search functionality
  const searchInput = document.getElementById('appointments-search');
  const searchBtn = document.getElementById('search-btn');
  
  // Store handlers for cleanup
  let searchInputHandler = null;
  let searchKeypressHandler = null;
  let searchBtnHandler = null;
  // searchTimeout is now global (declared at top of file)
  
  if (searchInput) {
    // Remove old handlers if they exist
    if (searchInputHandler) {
      searchInput.removeEventListener('input', searchInputHandler);
      searchInput.removeEventListener('keypress', searchKeypressHandler);
    }
    
    // Debounced search on input
    searchInputHandler = (e) => {
      clearTimeout(searchTimeout);
      const searchValue = e.target.value.trim();
      
      searchTimeout = setTimeout(() => {
        currentFilters.search = searchValue || undefined;
        fetchAppointments(currentFilters, 1);
      }, 400);
    };

    // Search on Enter key
    searchKeypressHandler = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchTimeout);
        const searchValue = searchInput.value.trim();
        currentFilters.search = searchValue || undefined;
        fetchAppointments(currentFilters, 1);
      }
    };
    
    searchInput.addEventListener('input', searchInputHandler);
    searchInput.addEventListener('keypress', searchKeypressHandler);
  }

  // Search button click (triggers search immediately)
  if (searchBtn && searchInput) {
    // Remove old handler if exists
    if (searchBtnHandler) {
      searchBtn.removeEventListener('click', searchBtnHandler);
    }
    
    searchBtnHandler = () => {
      const searchValue = searchInput.value.trim();
      currentFilters.search = searchValue || undefined;
      fetchAppointments(currentFilters, 1);
    };
    
    searchBtn.addEventListener('click', searchBtnHandler);
  }
}

/**
 * Populate department dropdown
 */
async function populateDepartments() {
  const dropdown = document.getElementById('department-filter');
  if (!dropdown) return;

  try {
    const response = await apiGet('/settings/departments');
    const result = await response.json();

    if (response.ok && result.success && result.data?.departments) {
      const departments = result.data.departments.filter(dept => dept.status === 'ACTIVE');
      
      // Clear existing options except "All Departments"
      dropdown.innerHTML = '<option value="">All Departments</option>';
      
      departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = dept.name;
        dropdown.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error fetching departments:', error);
  }
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize appointments page
 */
async function initializeAppointments() {
  // Check authentication
  if (!isAuthenticated()) {
    toast.error('Please log in to access appointments');
    window.location.href = '/login.html';
    return;
  }

  // Populate departments
  await populateDepartments();

  // Read filters from URL params
  const { filters: urlFilters, page: urlPage } = readURLParams();
  
  // Apply URL filters to current state
  if (Object.keys(urlFilters).length > 0 || urlPage > 1) {
    currentFilters = { ...currentFilters, ...urlFilters };
    currentPage = urlPage;
    
    // Apply filters to UI
    applyFiltersToUI(urlFilters);
  }

  // Setup filters (after applying URL params)
  setupFilters();

  // Setup action buttons
  setupActionButtons();
  
  // Fetch appointments with URL params if they exist
  if (Object.keys(urlFilters).length > 0 || urlPage > 1) {
    await fetchAppointments(currentFilters, currentPage);
  } else {
    // Initial load - fetch with default filters
    await fetchAppointments({}, 1);
  }
}

/**
 * Setup action button handlers
 */
function setupActionButtons() {
  const checkInBtn = document.getElementById('check-in-btn');
  const noShowBtn = document.getElementById('no-show-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  if (checkInBtn) {
    checkInBtn.addEventListener('click', handleCheckIn);
  }

  if (noShowBtn) {
    noShowBtn.addEventListener('click', handleMarkNoShow);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel);
  }
}

/**
 * Handle Check-In button click
 */
async function handleCheckIn() {
  if (!selectedAppointmentId) {
    toast.error('Please select an appointment');
    return;
  }

  const appointment = appointmentsState.find(apt => apt.id === selectedAppointmentId);
  if (!appointment) {
    toast.error('Appointment not found');
    return;
  }

  if (appointment.status !== 'BOOKED') {
    toast.error('Only BOOKED appointments can be checked in');
    return;
  }

  const checkInBtn = document.getElementById('check-in-btn');
  if (checkInBtn) {
    checkInBtn.disabled = true;
    checkInBtn.textContent = 'Checking in...';
  }

  try {
    const response = await apiPost(API_ENDPOINTS.staff.checkIn, {
      appointmentId: selectedAppointmentId,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to check in patient');
    }

    toast.success(result.message || 'Patient checked in successfully');
    
    // Refetch appointments to update status
    await fetchAppointments(currentFilters, currentPage);
    
    // Re-render details if still selected
    if (selectedAppointmentId) {
      renderAppointmentDetails();
    }
  } catch (error) {
    console.error('Error checking in:', error);
    toast.error(error.message || 'Failed to check in patient');
  } finally {
    if (checkInBtn) {
      checkInBtn.disabled = false;
      checkInBtn.textContent = 'Check-In';
    }
  }
}

/**
 * Handle Mark No-Show button click
 */
async function handleMarkNoShow() {
  if (!selectedAppointmentId) {
    toast.error('Please select an appointment');
    return;
  }

  const appointment = appointmentsState.find(apt => apt.id === selectedAppointmentId);
  if (!appointment) {
    toast.error('Appointment not found');
    return;
  }

  if (appointment.status !== 'BOOKED') {
    toast.error('Only BOOKED appointments can be marked as no-show');
    return;
  }

  const now = new Date();
  const appointmentDate = new Date(appointment.appointmentDate);
  if (appointmentDate >= now) {
    toast.error('Cannot mark as no-show. Appointment date has not passed.');
    return;
  }

  const noShowBtn = document.getElementById('no-show-btn');
  if (noShowBtn) {
    noShowBtn.disabled = true;
    noShowBtn.textContent = 'Marking...';
  }

  try {
    const response = await apiPatch(API_ENDPOINTS.staff.markNoShow(selectedAppointmentId));

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to mark as no-show');
    }

    toast.success(result.message || 'Appointment marked as no-show');
    
    // Refetch appointments to update status
    await fetchAppointments(currentFilters, currentPage);
    
    // Re-render details if still selected
    if (selectedAppointmentId) {
      renderAppointmentDetails();
    }
  } catch (error) {
    console.error('Error marking no-show:', error);
    toast.error(error.message || 'Failed to mark as no-show');
  } finally {
    if (noShowBtn) {
      noShowBtn.disabled = false;
      noShowBtn.textContent = 'Mark No-Show';
    }
  }
}

/**
 * Handle Cancel button click
 */
async function handleCancel() {
  if (!selectedAppointmentId) {
    toast.error('Please select an appointment');
    return;
  }

  const appointment = appointmentsState.find(apt => apt.id === selectedAppointmentId);
  if (!appointment) {
    toast.error('Appointment not found');
    return;
  }

  if (appointment.status !== 'BOOKED') {
    toast.error('Only BOOKED appointments can be cancelled');
    return;
  }

  // Confirm cancellation
  if (!confirm('Are you sure you want to cancel this appointment?')) {
    return;
  }

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling...';
  }

  try {
    const response = await apiPatch(API_ENDPOINTS.staff.cancelAppointment(selectedAppointmentId));

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to cancel appointment');
    }

    toast.success(result.message || 'Appointment cancelled successfully');
    
    // Refetch appointments to update status
    await fetchAppointments(currentFilters, currentPage);
    
    // Clear selection since appointment is cancelled
    selectedAppointmentId = null;
    const sidebar = document.getElementById('appointment-details-sidebar');
    const contentContainer = document.querySelector('.appointments-content');
    if (sidebar) sidebar.classList.remove('visible');
    if (contentContainer) contentContainer.classList.remove('sidebar-visible');
    
    // Re-render to clear selection highlight
    renderAppointments();
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    toast.error(error.message || 'Failed to cancel appointment');
  } finally {
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel Appointment';
    }
  }
}

// Cleanup function for SPA navigation
function cleanupAppointments() {
  // Clear search timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  
  // Cancel any pending requests
  cancelRequest('appointments-fetch');
  
  // Reset state
  selectedAppointmentId = null;
  appointmentsState = [];
  currentPage = 1;
  currentFilters = {};
}

// Export for use in navigation
export { initializeAppointments, cleanupAppointments };

// Listen for view-loaded event (SPA navigation)
window.addEventListener('view-loaded', async (event) => {
  if (event.detail?.route === 'appointments') {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      initializeAppointments();
    }, 100);
  }
}, { once: false }); // Allow multiple calls when navigating back

// Auto-initialize if page is loaded directly (non-SPA)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAppointments);
} else {
  // Check if we're in SPA mode (app-content exists) or standalone page
  const contentEl = document.getElementById('app-content');
  if (!contentEl) {
    // Standalone page, initialize immediately
    initializeAppointments();
  }
}
