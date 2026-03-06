/**
 * Staff Appointments Page
 * Handles appointment listing, filtering, and details display
 */

import { apiGet, apiPost, apiPatch } from '../../utils/apiClient.js';
import { isAuthenticated, getAuthUser } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { showConfirmModal } from '../../utils/modal.js';

// State
let appointmentsState = [];
let selectedAppointmentId = null;
let currentPage = 1;
let currentFilters = {};
let autoRefreshInterval = null;
let selectedAppointmentIds = new Set(); // For bulk operations
let currentUser = null; // For role-based restrictions

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

  // Preserve checkbox selections before re-rendering
  const previousSelections = new Set(selectedAppointmentIds);

  // Handle empty state
  if (appointmentsState.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          No appointments found
        </td>
      </tr>
    `;
    updateBulkActionsBar();
    return;
  }

  // Render each appointment
  appointmentsState.forEach((appointment) => {
    const row = createAppointmentRow(appointment);
    tbody.appendChild(row);
  });

  // Restore checkbox selections after re-rendering
  previousSelections.forEach(id => {
    selectedAppointmentIds.add(id);
    const checkbox = document.querySelector(`.appointment-checkbox[data-appointment-id="${id}"]`);
    if (checkbox) {
      checkbox.checked = true;
      const row = checkbox.closest('tr');
      if (row) {
        row.classList.add('checkbox-selected');
      }
    }
  });

  // Update select all and bulk actions bar
  updateSelectAllCheckbox();
  updateBulkActionsBar();
}

/**
 * Create appointment table row
 * @param {Object} appointment - Appointment data
 * @returns {HTMLElement} - Table row element
 */
function createAppointmentRow(appointment) {
  const row = document.createElement('tr');
  row.dataset.appointmentId = appointment.id;
  
  const isSelected = selectedAppointmentId === appointment.id;
  const isCheckboxSelected = selectedAppointmentIds.has(appointment.id);
  
  if (isSelected) {
    row.classList.add('selected');
  }
  if (isCheckboxSelected) {
    row.classList.add('checkbox-selected');
  }

  // Patient name
  const patientName = appointment.patient?.fullName || '-';
  
  // Doctor name (from queueEntry or assignedDoctor) - Show "Dr. Name" format
  let doctorName = 'Unassigned';
  if (appointment.queueEntry?.assignedDoctor) {
    const doctor = appointment.queueEntry.assignedDoctor;
    doctorName = `Dr. ${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Unassigned';
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
    <td class="checkbox-column">
      <input 
        type="checkbox" 
        class="appointment-checkbox" 
        data-appointment-id="${appointment.id}"
        ${isCheckboxSelected ? 'checked' : ''}
        onclick="event.stopPropagation();"
      />
    </td>
    <td>${escapeHtml(patientName)}</td>
    <td>${escapeHtml(doctorName)}</td>
    <td>${escapeHtml(departmentName)}</td>
    <td>${escapeHtml(type)}</td>
    <td>${dateTime}</td>
    <td>${statusBadge}</td>
  `;

  // Add click handler (for row selection, not checkbox)
  row.addEventListener('click', (e) => {
    // Don't select if clicking checkbox
    if (e.target.type === 'checkbox') {
      return;
    }
    selectAppointment(appointment.id);
  });

  // Add checkbox change handler
  const checkbox = row.querySelector('.appointment-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      handleCheckboxChange(appointment.id, checkbox.checked);
    });
  }

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
      doctorEl.textContent = `Dr. ${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Unassigned';
    } else {
      doctorEl.textContent = 'Unassigned';
    }
  }
  // Reason field
  const reasonEl = document.getElementById('detail-reason');
  if (reasonEl) {
    reasonEl.textContent = appointment.reason || '-';
  }

  if (notesEl) {
    notesEl.textContent = appointment.notes || '-';
  }

  // Notes section
  const notesTextEl = document.getElementById('detail-notes-text');
  if (notesTextEl) {
    notesTextEl.textContent = appointment.notes || 'No notes available.';
  }

  // Determine appointment date relative to now
  const appointmentDate = new Date(appointment.appointmentDate);
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appointmentDateOnly = new Date(appointmentDate);
  appointmentDateOnly.setHours(0, 0, 0, 0);
  
  const isBooked = appointment.status === 'BOOKED';
  const isToday = appointmentDateOnly.getTime() === today.getTime();
  const isFuture = appointmentDate > now;
  const isPast = appointmentDate < now;
  const hasActiveQueueEntry = appointment.queueEntry && 
    !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.queueEntry.status);

  // Show/hide buttons based on status and date
  // BOOKED + future: Reschedule, Cancel
  // BOOKED + today: Check-In, Reschedule, Cancel
  // BOOKED + past: Mark No-Show
  // CHECKED_IN, CANCELLED, NO_SHOW: None

  // Check-In button: BOOKED + today
  const checkInBtn = document.getElementById('check-in-btn');
  if (checkInBtn) {
    if (isBooked && isToday) {
      checkInBtn.style.display = 'block';
      checkInBtn.onclick = () => handleCheckIn(appointment.id);
    } else {
      checkInBtn.style.display = 'none';
      checkInBtn.onclick = null;
    }
  }

  // Reschedule button: BOOKED + (future OR today)
  const rescheduleBtn = document.getElementById('reschedule-btn');
  if (rescheduleBtn) {
    if (isBooked && (isFuture || isToday)) {
      rescheduleBtn.style.display = 'block';
      rescheduleBtn.onclick = () => openRescheduleModal(appointment.id, appointment.appointmentDate);
    } else {
      rescheduleBtn.style.display = 'none';
      rescheduleBtn.onclick = null;
    }
  }

  // Cancel button: BOOKED + (future OR today) AND no active queue entry
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    if (isBooked && (isFuture || isToday) && !hasActiveQueueEntry) {
      cancelBtn.style.display = 'block';
      cancelBtn.onclick = () => handleCancelAppointment(appointment.id, appointment.patient?.fullName || 'this patient');
    } else {
      cancelBtn.style.display = 'none';
      cancelBtn.onclick = null;
    }
  }

  // Mark No-Show button: BOOKED + past
  const noShowBtn = document.getElementById('no-show-btn');
  if (noShowBtn) {
    if (isBooked && isPast) {
      noShowBtn.style.display = 'block';
      noShowBtn.onclick = () => handleMarkNoShow(appointment.id, appointment.patient?.fullName || 'this patient');
    } else {
      noShowBtn.style.display = 'none';
      noShowBtn.onclick = null;
    }
  }

  // Edit button: Always visible for any appointment (role-based check)
  const editBtn = document.getElementById('edit-btn');
  if (editBtn) {
    if (canPerformAction('edit', appointment)) {
      editBtn.style.display = 'block';
      editBtn.onclick = () => openEditModal(appointment.id, appointment.reason || '', appointment.notes || '');
    } else {
      editBtn.style.display = 'none';
      editBtn.onclick = null;
    }
  }

  // Message button: Always visible for any appointment (role-based check)
  const messageBtn = document.getElementById('message-btn');
  if (messageBtn) {
    if (canPerformAction('message', appointment)) {
      messageBtn.style.display = 'block';
      messageBtn.onclick = () => openMessageModal(appointment.id, appointment.patient?.fullName || 'Patient');
    } else {
      messageBtn.style.display = 'none';
      messageBtn.onclick = null;
    }
  }

  // Assign Doctor button: Admin only, only for appointments with queueEntry
  const assignDoctorBtn = document.getElementById('assign-doctor-btn');
  if (assignDoctorBtn) {
    if (currentUser && currentUser.role === 'ADMIN' && appointment.queueEntry) {
      assignDoctorBtn.style.display = 'block';
      assignDoctorBtn.onclick = () => openAssignDoctorModal(appointment.id);
    } else {
      assignDoctorBtn.style.display = 'none';
      assignDoctorBtn.onclick = null;
    }
  }

  // Apply role-based restrictions to action buttons
  // Doctors can only perform actions on their assigned appointments
  if (!canPerformAction('cancel', appointment)) {
    if (cancelBtn) {
      cancelBtn.style.display = 'none';
      cancelBtn.onclick = null;
    }
  }
  if (!canPerformAction('reschedule', appointment)) {
    if (rescheduleBtn) {
      rescheduleBtn.style.display = 'none';
      rescheduleBtn.onclick = null;
    }
  }
  if (!canPerformAction('checkin', appointment)) {
    if (checkInBtn) {
      checkInBtn.style.display = 'none';
      checkInBtn.onclick = null;
    }
  }
  if (!canPerformAction('noshow', appointment)) {
    if (noShowBtn) {
      noShowBtn.style.display = 'none';
      noShowBtn.onclick = null;
    }
  }
}

/**
 * Handle check-in button click
 * @param {string} appointmentId - Appointment ID to check in
 */
async function handleCheckIn(appointmentId) {
  if (!appointmentId) {
    toast.error('Appointment ID is required');
    return;
  }

  const checkInBtn = document.getElementById('check-in-btn');
  if (checkInBtn) {
    checkInBtn.disabled = true;
    checkInBtn.textContent = 'Checking In...';
  }

  try {
    const response = await apiPost('/staff/queue/check-in', {
      appointmentId: appointmentId,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to check in patient');
    }

    toast.success(`Patient checked in successfully. Ticket: ${result.data.ticketNumber}`);

  // Refresh appointments list
  await fetchAppointments(currentFilters, currentPage);

  // Clear bulk selection if any
  selectedAppointmentIds.clear();
  updateBulkActionsBar();
  updateSelectAllCheckbox();

  // Re-render details to update status
  renderAppointmentDetails();
  } catch (error) {
    console.error('Error checking in patient:', error);
    toast.error(error.message || 'Failed to check in patient');
  } finally {
    if (checkInBtn) {
      checkInBtn.disabled = false;
      checkInBtn.textContent = 'Check-In';
    }
  }
}

/**
 * Handle cancel appointment button click
 * @param {string} appointmentId - Appointment ID to cancel
 * @param {string} patientName - Patient name for confirmation message
 */
async function handleCancelAppointment(appointmentId, patientName) {
  if (!appointmentId) {
    toast.error('Appointment ID is required');
    return;
  }

  // Show confirmation dialog
  const confirmed = await showConfirmModal({
    title: 'Cancel Appointment',
    message: `Are you sure you want to cancel the appointment for ${patientName}? This action cannot be undone.`,
    confirmText: 'Yes, Cancel',
    cancelText: 'Keep Appointment',
    confirmColor: 'red',
  });

  if (!confirmed) {
    return;
  }

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling...';
  }

  try {
    const response = await apiPatch(`/staff/appointments/${appointmentId}/cancel`);

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to cancel appointment');
    }

    toast.success('Appointment cancelled successfully.');

  // Refresh appointments list
  await fetchAppointments(currentFilters, currentPage);

  // Clear bulk selection if any
  selectedAppointmentIds.clear();
  updateBulkActionsBar();
  updateSelectAllCheckbox();

  // Re-render details to update status
  renderAppointmentDetails();
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    toast.error(error.message || 'Failed to cancel appointment');
  } finally {
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
    }
  }
}

/**
 * Handle mark no-show button click
 * @param {string} appointmentId - Appointment ID to mark as no-show
 * @param {string} patientName - Patient name for confirmation message
 */
async function handleMarkNoShow(appointmentId, patientName) {
  if (!appointmentId) {
    toast.error('Appointment ID is required');
    return;
  }

  // Show confirmation dialog
  const confirmed = await showConfirmModal({
    title: 'Mark as No-Show',
    message: `Are you sure you want to mark the appointment for ${patientName} as no-show? This action cannot be undone.`,
    confirmText: 'Yes, Mark No-Show',
    cancelText: 'Cancel',
    confirmColor: 'red',
  });

  if (!confirmed) {
    return;
  }

  const noShowBtn = document.getElementById('no-show-btn');
  if (noShowBtn) {
    noShowBtn.disabled = true;
    noShowBtn.textContent = 'Marking...';
  }

  try {
    const response = await apiPatch(`/staff/appointments/${appointmentId}/no-show`);

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to mark appointment as no-show');
    }

    toast.success('Appointment marked as no-show successfully.');

  // Refresh appointments list
  await fetchAppointments(currentFilters, currentPage);

  // Clear bulk selection if any
  selectedAppointmentIds.clear();
  updateBulkActionsBar();
  updateSelectAllCheckbox();

  // Re-render details to update status
  renderAppointmentDetails();
  } catch (error) {
    console.error('Error marking appointment as no-show:', error);
    toast.error(error.message || 'Failed to mark appointment as no-show');
  } finally {
    if (noShowBtn) {
      noShowBtn.disabled = false;
      noShowBtn.textContent = 'No Show';
    }
  }
}

/**
 * Open reschedule modal
 * @param {string} appointmentId - Appointment ID to reschedule
 * @param {string|Date} currentDate - Current appointment date
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
    await handleReschedule(appointmentId, datetimeInput.value, closeModal);
  });

  // Submit on Enter key in input
  datetimeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handleReschedule(appointmentId, datetimeInput.value, closeModal);
    }
  });
}

/**
 * Handle reschedule submission
 * @param {string} appointmentId - Appointment ID to reschedule
 * @param {string} newDateTime - New date and time (datetime-local format)
 * @param {Function} closeModal - Function to close the modal
 */
async function handleReschedule(appointmentId, newDateTime, closeModal) {
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
    const response = await apiPatch(`/staff/appointments/${appointmentId}/reschedule`, {
      appointmentDate: date.toISOString(),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to reschedule appointment');
    }

    toast.success('Appointment rescheduled successfully.');

    // Close modal
    closeModal();

    // Refresh appointments list
    await fetchAppointments(currentFilters, currentPage);

    // Re-render details to update date
    renderAppointmentDetails();
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
 * Open edit appointment modal
 * @param {string} appointmentId - Appointment ID to edit
 * @param {string} currentReason - Current reason
 * @param {string} currentNotes - Current notes
 */
function openEditModal(appointmentId, currentReason, currentNotes) {
  const modal = document.getElementById('edit-modal-overlay');
  const reasonInput = document.getElementById('edit-reason-input');
  const notesInput = document.getElementById('edit-notes-input');
  const cancelBtn = document.getElementById('edit-cancel-btn');
  const submitBtn = document.getElementById('edit-submit-btn');

  if (!modal || !reasonInput || !notesInput || !cancelBtn || !submitBtn) {
    toast.error('Edit modal elements not found');
    return;
  }

  // Set current values
  reasonInput.value = currentReason || '';
  notesInput.value = currentNotes || '';

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
    await handleEditAppointment(appointmentId, reasonInput.value, notesInput.value, closeModal);
  });
}

/**
 * Handle edit appointment submission
 * @param {string} appointmentId - Appointment ID to edit
 * @param {string} reason - Updated reason
 * @param {string} notes - Updated notes
 * @param {Function} closeModal - Function to close the modal
 */
async function handleEditAppointment(appointmentId, reason, notes, closeModal) {
  if (!appointmentId) {
    toast.error('Appointment ID is required');
    return;
  }

  const submitBtn = document.getElementById('edit-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  try {
    const updateData = {};
    if (reason !== undefined) updateData.reason = reason.trim() || null;
    if (notes !== undefined) updateData.notes = notes.trim() || null;

    const response = await apiPatch(`/staff/appointments/${appointmentId}`, updateData);

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to update appointment');
    }

    toast.success('Appointment updated successfully.');

    // Close modal
    closeModal();

    // Refresh appointments list
    await fetchAppointments(currentFilters, currentPage);

    // Re-render details to update notes/reason
    renderAppointmentDetails();
  } catch (error) {
    console.error('Error updating appointment:', error);
    toast.error(error.message || 'Failed to update appointment');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  }
}

/**
 * Open message modal
 * @param {string} appointmentId - Appointment ID
 * @param {string} patientName - Patient name
 */
function openMessageModal(appointmentId, patientName) {
  const modal = document.getElementById('message-modal-overlay');
  const messageInput = document.getElementById('message-input');
  const cancelBtn = document.getElementById('message-cancel-btn');
  const submitBtn = document.getElementById('message-submit-btn');

  if (!modal || !messageInput || !cancelBtn || !submitBtn) {
    toast.error('Message modal elements not found');
    return;
  }

  // Clear message input
  messageInput.value = '';

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
    await handleSendMessage(appointmentId, messageInput.value, closeModal);
  });

  // Submit on Enter key (Ctrl+Enter or Cmd+Enter)
  messageInput.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      await handleSendMessage(appointmentId, messageInput.value, closeModal);
    }
  });
}

/**
 * Handle send message submission
 * @param {string} appointmentId - Appointment ID
 * @param {string} message - Message content
 * @param {Function} closeModal - Function to close the modal
 */
async function handleSendMessage(appointmentId, message, closeModal) {
  if (!appointmentId || !message || !message.trim()) {
    toast.error('Please enter a message');
    return;
  }

  const submitBtn = document.getElementById('message-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
  }

  try {
    const response = await apiPost(`/staff/appointments/${appointmentId}/message`, {
      message: message.trim(),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to send message');
    }

    toast.success('Message sent successfully');

    // Close modal
    closeModal();

    // Refresh appointments list (optional, but good for consistency)
    await fetchAppointments(currentFilters, currentPage);
  } catch (error) {
    console.error('Error sending message:', error);
    toast.error(error.message || 'Failed to send message');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    }
  }
}

/**
 * Open assign doctor modal
 * @param {string} appointmentId - Appointment ID
 */
async function openAssignDoctorModal(appointmentId) {
  const modal = document.getElementById('assign-doctor-modal-overlay');
  const doctorSelect = document.getElementById('assign-doctor-select');
  const cancelBtn = document.getElementById('assign-doctor-cancel-btn');
  const submitBtn = document.getElementById('assign-doctor-submit-btn');

  if (!modal || !doctorSelect || !cancelBtn || !submitBtn) {
    toast.error('Assign doctor modal elements not found');
    return;
  }

  // Find current appointment
  const appointment = appointmentsState.find(apt => apt.id === appointmentId);
  if (!appointment) {
    toast.error('Appointment not found');
    return;
  }

  // Fetch available doctors
  try {
    const response = await apiGet(`/staff/appointments/${appointmentId}/doctors`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch doctors');
    }

    // Populate doctor select
    doctorSelect.innerHTML = '<option value="">-- Unassign Doctor --</option>';
    
    if (result.data.doctors && result.data.doctors.length > 0) {
      result.data.doctors.forEach(doctor => {
        const option = document.createElement('option');
        option.value = doctor.id;
        const capacityInfo = doctor.isAvailable && doctor.currentActivePatients < doctor.maxConcurrentPatients 
          ? ` (Available)` 
          : ` (${doctor.currentActivePatients}/${doctor.maxConcurrentPatients})`;
        option.textContent = `${doctor.lastName}${capacityInfo}`;
        option.dataset.doctor = JSON.stringify(doctor);
        
        // Select current doctor if assigned
        if (appointment.queueEntry?.assignedDoctorId === doctor.id) {
          option.selected = true;
        }
        
        doctorSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error fetching doctors:', error);
    toast.error(error.message || 'Failed to fetch doctors');
    return;
  }

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
    await handleAssignDoctor(appointmentId, doctorSelect.value, closeModal);
  });
}

/**
 * Handle assign doctor submission
 * @param {string} appointmentId - Appointment ID
 * @param {string} doctorId - Doctor ID to assign (or empty string to unassign)
 * @param {Function} closeModal - Function to close the modal
 */
async function handleAssignDoctor(appointmentId, doctorId, closeModal) {
  if (!appointmentId) {
    toast.error('Appointment ID is required');
    return;
  }

  const submitBtn = document.getElementById('assign-doctor-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Assigning...';
  }

  try {
    const response = await apiPatch(`/staff/appointments/${appointmentId}/assign-doctor`, {
      doctorId: doctorId || null,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to assign doctor');
    }

    toast.success(result.message || 'Doctor assigned successfully');

    // Close modal
    closeModal();

    // Refresh appointments list
    await fetchAppointments(currentFilters, currentPage);

    // Re-render details to update doctor
    renderAppointmentDetails();
  } catch (error) {
    console.error('Error assigning doctor:', error);
    toast.error(error.message || 'Failed to assign doctor');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Assign';
    }
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
    
    // Debounced search on input (optimized to 300ms for better responsiveness)
    searchInputHandler = (e) => {
      clearTimeout(searchTimeout);
      const searchValue = e.target.value.trim();
      
      searchTimeout = setTimeout(() => {
        currentFilters.search = searchValue || undefined;
        fetchAppointments(currentFilters, 1);
      }, 300);
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
 * Load modal CSS for appointments page only
 */
function loadModalCSS() {
  // Check if modal CSS is already loaded for this page
  const existingLink = document.getElementById('appointments-modal-css');
  if (existingLink) {
    return; // Already loaded
  }

  // Create and append link element
  const link = document.createElement('link');
  link.id = 'appointments-modal-css';
  link.rel = 'stylesheet';
  link.href = '/src/styles/modal.css';
  document.head.appendChild(link);
}

/**
 * Start auto-refresh polling
 * Refreshes appointments every 30 seconds
 */
function startAutoRefresh() {
  // Clear existing interval if any
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  // Refresh every 30 seconds
  autoRefreshInterval = setInterval(() => {
    // Only refresh if page is visible (not in background tab)
    if (!document.hidden) {
      fetchAppointments(currentFilters, currentPage);
    }
  }, 30000); // 30 seconds
}

/**
 * Stop auto-refresh polling
 */
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

/**
 * Handle checkbox change for bulk selection
 * @param {string} appointmentId - Appointment ID
 * @param {boolean} checked - Checkbox checked state
 */
function handleCheckboxChange(appointmentId, checked) {
  if (checked) {
    selectedAppointmentIds.add(appointmentId);
  } else {
    selectedAppointmentIds.delete(appointmentId);
  }

  // Update row visual state
  const row = document.querySelector(`tr[data-appointment-id="${appointmentId}"]`);
  if (row) {
    if (checked) {
      row.classList.add('checkbox-selected');
    } else {
      row.classList.remove('checkbox-selected');
    }
  }

  // Update select all checkbox
  updateSelectAllCheckbox();

  // Update bulk actions bar
  updateBulkActionsBar();
}

/**
 * Update select all checkbox state
 */
function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (!selectAllCheckbox) return;

  const allCheckboxes = document.querySelectorAll('.appointment-checkbox:not(#select-all-checkbox)');
  const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;

  if (checkedCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedCount === allCheckboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

/**
 * Update bulk actions bar visibility and count
 */
function updateBulkActionsBar() {
  const bulkActionsBar = document.getElementById('bulk-actions-bar');
  const bulkActionsCount = document.getElementById('bulk-actions-count');

  if (!bulkActionsBar || !bulkActionsCount) return;

  const count = selectedAppointmentIds.size;

  if (count > 0) {
    bulkActionsBar.style.display = 'flex';
    bulkActionsCount.textContent = `${count} selected`;
  } else {
    bulkActionsBar.style.display = 'none';
  }
}

/**
 * Handle select all checkbox
 */
function handleSelectAll(checked) {
  const checkboxes = document.querySelectorAll('.appointment-checkbox:not(#select-all-checkbox)');
  
  checkboxes.forEach(checkbox => {
    const appointmentId = checkbox.dataset.appointmentId;
    checkbox.checked = checked;
    
    if (checked) {
      selectedAppointmentIds.add(appointmentId);
    } else {
      selectedAppointmentIds.delete(appointmentId);
    }

    // Update row visual state
    const row = checkbox.closest('tr');
    if (row) {
      if (checked) {
        row.classList.add('checkbox-selected');
      } else {
        row.classList.remove('checkbox-selected');
      }
    }
  });

  updateBulkActionsBar();
}

/**
 * Handle bulk cancel
 */
async function handleBulkCancel() {
  const selectedIds = Array.from(selectedAppointmentIds);
  
  if (selectedIds.length === 0) {
    toast.error('Please select at least one appointment');
    return;
  }

  // Filter to only BOOKED appointments that can be cancelled
  const cancellableAppointments = appointmentsState.filter(apt => 
    selectedIds.includes(apt.id) &&
    apt.status === 'BOOKED' &&
    (!apt.queueEntry || ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(apt.queueEntry.status))
  );

  if (cancellableAppointments.length === 0) {
    toast.error('No cancellable appointments selected');
    return;
  }

  const confirmed = await showConfirmModal({
    title: 'Bulk Cancel Appointments',
    message: `Are you sure you want to cancel ${cancellableAppointments.length} appointment(s)? This action cannot be undone.`,
    confirmText: 'Yes, Cancel',
    cancelText: 'Keep Appointments',
    confirmColor: 'red',
  });

  if (!confirmed) {
    return;
  }

  const cancelBtn = document.getElementById('bulk-cancel-btn');
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling...';
  }

  try {
    // Cancel appointments in parallel
    const results = await Promise.allSettled(
      cancellableAppointments.map(apt => 
        apiPatch(`/staff/appointments/${apt.id}/cancel`)
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.length - successCount;

    if (successCount > 0) {
      toast.success(`Cancelled ${successCount} appointment(s)`);
    }
    if (failedCount > 0) {
      toast.error(`Failed to cancel ${failedCount} appointment(s).`);
    }

    // Clear selection
    selectedAppointmentIds.clear();
    updateBulkActionsBar();
    updateSelectAllCheckbox();

    // Refresh appointments list
    await fetchAppointments(currentFilters, currentPage);
  } catch (error) {
    console.error('Error in bulk cancel:', error);
    toast.error('Failed to cancel appointments');
  } finally {
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Bulk Cancel';
    }
  }
}

/**
 * Handle bulk reschedule
 */
async function handleBulkReschedule() {
  const selectedIds = Array.from(selectedAppointmentIds);
  
  if (selectedIds.length === 0) {
    toast.error('Please select at least one appointment');
    return;
  }

  // Filter to only BOOKED appointments that can be rescheduled
  const reschedulableAppointments = appointmentsState.filter(apt => 
    selectedIds.includes(apt.id) &&
    apt.status === 'BOOKED'
  );

  if (reschedulableAppointments.length === 0) {
    toast.error('No reschedulable appointments selected');
    return;
  }

  // Open reschedule modal with bulk mode
  openBulkRescheduleModal(reschedulableAppointments);
}

/**
 * Open bulk reschedule modal
 * @param {Array} appointments - Appointments to reschedule
 */
function openBulkRescheduleModal(appointments) {
  const modal = document.getElementById('reschedule-modal-overlay');
  const datetimeInput = document.getElementById('reschedule-datetime-input');
  const cancelBtn = document.getElementById('reschedule-cancel-btn');
  const submitBtn = document.getElementById('reschedule-submit-btn');
  const modalTitle = document.querySelector('.reschedule-modal-title');
  const modalMessage = document.querySelector('.reschedule-modal-message');

  if (!modal || !datetimeInput || !cancelBtn || !submitBtn) {
    toast.error('Reschedule modal elements not found');
    return;
  }

  // Update modal title and message for bulk mode
  if (modalTitle) {
    modalTitle.textContent = `Bulk Reschedule (${appointments.length} appointments)`;
  }
  if (modalMessage) {
    modalMessage.textContent = `Select a new date and time for ${appointments.length} appointment(s). All appointments will be rescheduled to the same date and time.`;
  }

  // Set minimum date to now
  const now = new Date();
  const minYear = now.getFullYear();
  const minMonth = String(now.getMonth() + 1).padStart(2, '0');
  const minDay = String(now.getDate()).padStart(2, '0');
  const minHours = String(now.getHours()).padStart(2, '0');
  const minMinutes = String(now.getMinutes()).padStart(2, '0');
  datetimeInput.min = `${minYear}-${minMonth}-${minDay}T${minHours}:${minMinutes}`;
  datetimeInput.value = '';

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
    // Reset modal title/message
    if (modalTitle) modalTitle.textContent = 'Reschedule Appointment';
    if (modalMessage) modalMessage.textContent = 'Select a new date and time for this appointment.';
  };

  newCancelBtn.addEventListener('click', closeModal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Submit handler for bulk reschedule
  newSubmitBtn.addEventListener('click', async () => {
    await handleBulkRescheduleSubmit(appointments, datetimeInput.value, closeModal);
  });
}

/**
 * Handle bulk reschedule submission
 * @param {Array} appointments - Appointments to reschedule
 * @param {string} newDateTime - New date and time (datetime-local format)
 * @param {Function} closeModal - Function to close the modal
 */
async function handleBulkRescheduleSubmit(appointments, newDateTime, closeModal) {
  if (!newDateTime) {
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
    // Reschedule appointments in parallel
    const results = await Promise.allSettled(
      appointments.map(apt => 
        apiPatch(`/staff/appointments/${apt.id}/reschedule`, {
          appointmentDate: date.toISOString(),
        })
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.length - successCount;

    if (successCount > 0) {
      toast.success(`Rescheduled ${successCount} appointment(s)`);
    }
    if (failedCount > 0) {
      toast.error(`Failed to reschedule ${failedCount} appointment(s).`);
    }

    // Close modal
    closeModal();

    // Clear selection
    selectedAppointmentIds.clear();
    updateBulkActionsBar();
    updateSelectAllCheckbox();

    // Refresh appointments list
    await fetchAppointments(currentFilters, currentPage);
  } catch (error) {
    console.error('Error in bulk reschedule:', error);
    toast.error('Failed to reschedule appointments');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reschedule';
    }
  }
}

/**
 * Clear bulk selection
 */
function clearBulkSelection() {
  selectedAppointmentIds.clear();
  
  // Uncheck all checkboxes
  const checkboxes = document.querySelectorAll('.appointment-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });

  // Remove visual selection from rows
  const rows = document.querySelectorAll('#appointments-table-body tr');
  rows.forEach(row => {
    row.classList.remove('checkbox-selected');
  });

  updateBulkActionsBar();
  updateSelectAllCheckbox();
}

/**
 * Check if user can perform action (role-based restrictions)
 * @param {string} action - Action to check (cancel, reschedule, etc.)
 * @param {Object} appointment - Appointment object
 * @returns {boolean} - Whether user can perform action
 */
function canPerformAction(action, appointment) {
  if (!currentUser) {
    currentUser = getAuthUser();
  }

  if (!currentUser) {
    return false;
  }

  // Admin and Primary staff can do everything
  if (currentUser.role === 'ADMIN' || currentUser.isPrimary === true) {
    return true;
  }

  // Doctors can only perform actions on their assigned appointments
  if (currentUser.role === 'STAFF' && !currentUser.isPrimary) {
    // Check if appointment is assigned to this doctor
    const assignedDoctorId = appointment.queueEntry?.assignedDoctorId;
    if (assignedDoctorId && assignedDoctorId === currentUser.id) {
      return true;
    }
    // If no doctor assigned yet, doctors can't perform actions
    return false;
  }

  return false;
}

/**
 * Initialize appointments page
 */
async function initializeAppointments() {
  // Load modal CSS for this page only
  loadModalCSS();

  // Check authentication
  if (!isAuthenticated()) {
    toast.error('Please log in to access appointments');
    window.location.href = '/login.html';
    return;
  }

  // Get current user for role-based restrictions
  currentUser = getAuthUser();

  // Populate departments
  await populateDepartments();

  // Setup filters
  setupFilters();

  // Setup bulk operations
  setupBulkOperations();

  // Initial fetch
  await fetchAppointments({}, 1);

  // Start auto-refresh
  startAutoRefresh();

  // Stop auto-refresh when page becomes hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  });
}

/**
 * Setup bulk operations event listeners
 */
function setupBulkOperations() {
  // Select all checkbox
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      handleSelectAll(e.target.checked);
    });
  }

  // Bulk cancel button
  const bulkCancelBtn = document.getElementById('bulk-cancel-btn');
  if (bulkCancelBtn) {
    bulkCancelBtn.addEventListener('click', handleBulkCancel);
  }

  // Bulk reschedule button
  const bulkRescheduleBtn = document.getElementById('bulk-reschedule-btn');
  if (bulkRescheduleBtn) {
    bulkRescheduleBtn.addEventListener('click', handleBulkReschedule);
  }

  // Clear selection button
  const bulkClearBtn = document.getElementById('bulk-clear-btn');
  if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', clearBulkSelection);
  }
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
