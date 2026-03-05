/**
 * Staff Appointments Page
 * Handles appointment listing, filtering, and details display
 */

import { apiGet } from '../../utils/apiClient.js';
import { isAuthenticated, getAuthUser } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// State
let appointmentsState = [];
let selectedAppointmentId = null;
let currentPage = 1;
let currentFilters = {};

// Store handlers for cleanup on re-initialization
let dateRangeClickHandler = null;
let outsideClickHandler = null;
let applyDateHandler = null;
let clearDateHandler = null;
let departmentChangeHandler = null;
let searchInputHandler = null;
let searchKeypressHandler = null;
let searchBtnHandler = null;
let searchTimeout = null;

/**
 * Fetch appointments from API
 * @param {Object} filters - Filter parameters
 * @param {number} page - Page number
 */
async function fetchAppointments(filters = {}, page = 1) {
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

    const response = await apiGet(endpoint);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch appointments');
    }

    // Store state
    appointmentsState = result.data.appointments || [];
    currentPage = page;
    currentFilters = filters;

    // Render
    renderAppointments();
    renderPagination(result.data.pagination);

  } catch (error) {
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

  // Clear table
  tbody.innerHTML = '';

  // Handle empty state
  if (appointmentsState.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          No appointments found
        </td>
      </tr>
    `;
    return;
  }

  // Render each appointment
  appointmentsState.forEach((appointment) => {
    const row = createAppointmentRow(appointment);
    tbody.appendChild(row);
  });
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
      
      // Update filters
      const status = btn.dataset.status || '';
      currentFilters.status = status || undefined;
      
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
  let searchTimeout = null;
  
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

  // Setup filters
  setupFilters();

  // Initial fetch
  await fetchAppointments({}, 1);
}

// Export for use in navigation
export { initializeAppointments };

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
