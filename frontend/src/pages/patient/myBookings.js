/**
 * My Bookings Page
 * Displays all patient appointments in a table with pagination
 */

'use strict';

import { apiGet, apiPatch } from '../../utils/apiClient.js';
import { getAuthUser, clearAuth, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { confirmCancelAppointment } from '../../utils/modal.js';
import { displayAvatar } from '../../utils/avatar.js';

// Check authentication
if (!isAuthenticated()) {
  window.location.href = '/login.html#login';
}

const user = getAuthUser();
if (!user) {
  window.location.href = '/login.html#login';
}

// Display user avatar
const userProfile = document.getElementById('user-profile');
const userInitial = document.getElementById('user-initial');
if (userProfile) {
  // displayAvatar expects: (element, avatarUrl, fullName)
  const avatarUrl = user?.avatarUrl || null;
  const fullName = user?.fullName || user?.name || 'User';
  displayAvatar(userProfile, avatarUrl, fullName);
  if (userInitial && !avatarUrl) {
    userInitial.textContent = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }
}

// Pagination state
let currentPage = 1;
const limit = 10;
let totalPages = 1;
let totalCount = 0;

// DOM elements
const appointmentsTableBody = document.getElementById('appointments-table-body');
const pagination = document.getElementById('pagination');
const paginationInfo = document.getElementById('pagination-info');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const hamburgerMenu = document.getElementById('hamburger-menu');
const mobileNav = document.getElementById('mobile-nav');

// Mobile navigation
if (hamburgerMenu && mobileNav) {
  hamburgerMenu.addEventListener('click', () => {
    hamburgerMenu.classList.toggle('active');
    mobileNav.classList.toggle('active');
  });

  // Close mobile nav when clicking outside
  document.addEventListener('click', (e) => {
    if (!mobileNav.contains(e.target) && !hamburgerMenu.contains(e.target)) {
      hamburgerMenu.classList.remove('active');
      mobileNav.classList.remove('active');
    }
  });
}

/**
 * Format date (e.g., "March 8, 2026")
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time (e.g., "11:28 PM")
 */
function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get status badge class
 */
function getStatusBadgeClass(status) {
  const statusMap = {
    BOOKED: 'booked',
    CHECKED_IN: 'checked_in',
    MOVED_TO_QUEUE: 'moved_to_queue',
    IN_CONSULTATION: 'in_consultation',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    NO_SHOW: 'no_show',
  };
  return statusMap[status] || 'booked';
}

/**
 * Format status text
 */
function formatStatus(status) {
  const statusMap = {
    BOOKED: 'Booked',
    CHECKED_IN: 'Checked In',
    MOVED_TO_QUEUE: 'In Queue',
    IN_CONSULTATION: 'In Consultation',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    NO_SHOW: 'No Show',
  };
  return statusMap[status] || status;
}

/**
 * Load appointments
 */
async function loadAppointments(page = 1) {
  try {
    if (appointmentsTableBody) {
      appointmentsTableBody.innerHTML = '<tr><td colspan="3" class="loading-state">Loading appointments...</td></tr>';
    }

    const response = await apiGet(`/patient/appointments?page=${page}&limit=${limit}`);

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      toast.error(result.message || 'Failed to load appointments');
      if (appointmentsTableBody) {
        appointmentsTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">Failed to load appointments</td></tr>';
      }
      return;
    }

    const { appointments, pagination: paginationData } = result.data;

    // Update pagination state
    currentPage = paginationData.currentPage;
    totalPages = paginationData.totalPages;
    totalCount = paginationData.totalCount;

    // Render appointments
    renderAppointments(appointments);

    // Update pagination UI
    updatePagination();
  } catch (error) {
    console.error('Error loading appointments:', error);
    toast.error('Failed to load appointments');
    if (appointmentsTableBody) {
      appointmentsTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">Failed to load appointments</td></tr>';
    }
  }
}

/**
 * Render appointments table
 */
function renderAppointments(appointments) {
  if (!appointmentsTableBody) return;

  if (!appointments || appointments.length === 0) {
    appointmentsTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No upcoming appointments</td></tr>';
    return;
  }

  appointmentsTableBody.innerHTML = appointments
    .map((apt) => {
      const date = formatDate(apt.appointmentDate);
      const time = formatTime(apt.appointmentDate);
      const departmentName = apt.department?.name || 'Department';

      // Action buttons - all appointments shown are BOOKED, so always show actions
      const actions = `
        <a href="#" class="action-link reschedule" data-appointment-id="${apt.id}">Reschedule</a>
        <a href="#" class="action-link cancel" data-appointment-id="${apt.id}">Cancel</a>
      `;

      return `
        <tr>
          <td data-label="Date & Time" style="text-align: center;">
            <span style="font-size: 1rem;">${date} ${time}</span>
          </td>
          <td data-label="Department" style="text-align: center; font-size: 1rem;">${departmentName}</td>
          <td data-label="Actions" style="text-align: center;">
            <div class="action-buttons">
              ${actions}
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Add event listeners for action buttons
  const rescheduleButtons = appointmentsTableBody.querySelectorAll('.action-link.reschedule');
  const cancelButtons = appointmentsTableBody.querySelectorAll('.action-link.cancel');

  rescheduleButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const appointmentId = btn.dataset.appointmentId;
      await handleReschedule(appointmentId);
    });
  });

  cancelButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const appointmentId = btn.dataset.appointmentId;
      await handleCancel(appointmentId);
    });
  });
}

/**
 * Update pagination UI
 */
function updatePagination() {
  if (!pagination || !paginationInfo || !prevPageBtn || !nextPageBtn) return;

  if (totalPages <= 1) {
    pagination.style.display = 'none';
    return;
  }

  pagination.style.display = 'flex';

  // Update pagination info
  const start = (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, totalCount);
  paginationInfo.textContent = `Showing ${start}-${end} of ${totalCount} appointments`;

  // Update button states
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
}

/**
 * Handle reschedule
 */
async function handleReschedule(appointmentId) {
  // Find the appointment to get current date
  const appointments = await getAppointmentsForReschedule(appointmentId);
  if (!appointments || appointments.length === 0) {
    toast.error('Appointment not found');
    return;
  }

  const appointment = appointments[0];
  openRescheduleModal(appointmentId, appointment.appointmentDate);
}

/**
 * Get appointment data for reschedule
 */
async function getAppointmentsForReschedule(appointmentId) {
  try {
    const response = await apiGet('/patient/appointments');
    if (!response.ok) {
      throw new Error('Failed to fetch appointments');
    }
    const result = await response.json();
    return result.data?.appointments?.filter(apt => apt.id === appointmentId) || [];
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return [];
  }
}

/**
 * Open reschedule modal
 */
function openRescheduleModal(appointmentId, currentDate) {
  const modal = document.getElementById('reschedule-modal-overlay');
  const datetimeInput = document.getElementById('reschedule-datetime-input');
  const cancelBtn = document.getElementById('reschedule-cancel-btn');
  const submitBtn = document.getElementById('reschedule-submit-btn');

  if (!modal || !datetimeInput || !cancelBtn || !submitBtn) {
    toast.error('Reschedule modal elements not found');
    return;
  }

  // Set current date as default value (format: YYYY-MM-DDTHH:mm)
  const date = new Date(currentDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  datetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;

  // Set minimum date to now (prevent past dates)
  const now = new Date();
  const minYear = now.getFullYear();
  const minMonth = String(now.getMonth() + 1).padStart(2, '0');
  const minDay = String(now.getDate()).padStart(2, '0');
  const minHours = String(now.getHours()).padStart(2, '0');
  const minMinutes = String(now.getMinutes()).padStart(2, '0');
  datetimeInput.min = `${minYear}-${minMonth}-${minDay}T${minHours}:${minMinutes}`;

  // Show modal
  modal.style.display = 'flex';

  // Remove existing event listeners by cloning elements
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  
  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

  // Close modal handlers
  const closeModal = () => {
    modal.style.display = 'none';
  };

  newCancelBtn.addEventListener('click', closeModal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Submit handler
  newSubmitBtn.addEventListener('click', async () => {
    await submitReschedule(appointmentId, datetimeInput.value, closeModal);
  });

  // Submit on Enter key in input
  datetimeInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await submitReschedule(appointmentId, datetimeInput.value, closeModal);
    }
  });
}

/**
 * Submit reschedule request
 */
async function submitReschedule(appointmentId, newDateTime, closeModal) {
  if (!appointmentId || !newDateTime) {
    toast.error('Please select a date and time');
    return;
  }

  // Convert datetime-local to ISO string
  const date = new Date(newDateTime);
  if (isNaN(date.getTime())) {
    toast.error('Invalid date format');
    return;
  }

  const submitBtn = document.getElementById('reschedule-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Rescheduling...';
  }

  try {
    const response = await apiPatch(`/appointments/${appointmentId}/reschedule`, {
      appointmentDate: date.toISOString(),
    });

    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to reschedule appointment');
    }

    toast.success('Appointment rescheduled successfully.');

    // Close modal
    closeModal();

    // Reload appointments
    await loadAppointments(currentPage);
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    toast.error(error.message || 'Failed to reschedule appointment');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reschedule';
    }
  }
}

/**
 * Handle cancel appointment
 */
async function handleCancel(appointmentId) {
  const confirmed = await confirmCancelAppointment();
  if (!confirmed) {
    return;
  }

  try {
    const response = await apiPatch(`/appointments/${appointmentId}/cancel`, {});
    
    if (response.status === 401) {
      toast.error('Session expired. Please log in again.');
      clearAuth();
      setTimeout(() => {
        window.location.href = '/login.html#login';
      }, 1500);
      return;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to cancel appointment');
    }

    toast.success('Appointment cancelled successfully');
    
    // Reload appointments
    await loadAppointments(currentPage);
  } catch (error) {
    console.error('Cancel appointment error:', error);
    toast.error(error.message || 'Failed to cancel appointment. Please try again.');
  }
}

// Pagination event listeners
if (prevPageBtn) {
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      loadAppointments(currentPage - 1);
    }
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadAppointments(currentPage + 1);
    }
  });
}

// Initial load
loadAppointments(1);
