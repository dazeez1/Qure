/**
 * Queue Control Page
 * Handles queue management for staff
 */

'use strict';

import { apiGet, apiPatch } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// State
let queueData = [];
let selectedQueueEntries = new Set();
let currentPage = 1;
let totalPages = 1;
let pollingInterval = null;
let currentQueueEntryId = null; // For room assignment
let availableRooms = [];

// DOM Elements
let queueTableBody;
let selectAllCheckbox;
let callNextBtn;
let notifyBtn;
let reassignBtn;
let noShowBtn;
let queueSearchInput;
let queueDatePicker;
let patientDetailsCard;
let roomModalOverlay;
let roomList;
let roomModalConfirm;
let roomModalCancel;
let roomModalClose;
let prevPageBtn;
let nextPageBtn;
let queueSummaryText;
let loadingSpinner;
let doctorLoadBadge;

// User info
let user = null;
let isDoctor = false;
let isAdmin = false;
let isPrimary = false;

/**
 * Initialize queue page
 */
function initQueuePage() {
  // Check authentication
  if (!isAuthenticated()) {
    toast.error('Please log in to access the queue');
    window.location.href = '/login.html';
    return;
  }

  user = getAuthUser();
  if (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN')) {
    toast.error('Access denied');
    window.location.href = '/login.html';
    return;
  }

  isDoctor = user.role === 'STAFF' && user.staffRole === 'DOCTOR';
  isAdmin = user.role === 'ADMIN';
  isPrimary = user.isPrimary === true || user.isPrimary === 'true';

  // Get DOM elements
  queueTableBody = document.getElementById('queue-table-body');
  callNextBtn = document.getElementById('call-next-btn');
  notifyBtn = document.getElementById('notify-btn');
  reassignBtn = document.getElementById('reassign-btn');
  noShowBtn = document.getElementById('no-show-btn');
  queueSearchInput = document.getElementById('queue-search-input');
  queueDatePicker = document.getElementById('queue-date-picker');
  patientDetailsCard = document.getElementById('patient-details-card');
  roomModalOverlay = document.getElementById('room-modal-overlay');
  roomList = document.getElementById('room-list');
  roomModalConfirm = document.getElementById('room-modal-confirm');
  roomModalCancel = document.getElementById('room-modal-cancel');
  roomModalClose = document.getElementById('room-modal-close');
  prevPageBtn = document.getElementById('prev-page-btn');
  nextPageBtn = document.getElementById('next-page-btn');
  queueSummaryText = document.getElementById('queue-summary-text');
  loadingSpinner = document.getElementById('loading-spinner');
  doctorLoadBadge = document.getElementById('doctor-load-badge');
  
  // Sidebar close button
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', hidePatientDetails);
  }

  // Set today's date as default
  const today = new Date().toISOString().split('T')[0];
  if (queueDatePicker) {
    queueDatePicker.value = today;
  }

  // Setup event listeners
  setupEventListeners();

  // Setup role-aware button visibility
  setupRoleAwareButtons();

  // Initial load
  fetchQueue();
  
  // Fetch doctor load on initial load
  if (isDoctor) {
    fetchDoctorLoad();
  }

  // Start polling
  startPolling();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Action buttons
  if (callNextBtn) {
    callNextBtn.addEventListener('click', handleCallNext);
  }
  if (notifyBtn) {
    notifyBtn.addEventListener('click', handleNotify);
  }
  if (reassignBtn) {
    reassignBtn.addEventListener('click', handleReassign);
  }
  if (noShowBtn) {
    noShowBtn.addEventListener('click', handleNoShow);
  }

  // Search
  if (queueSearchInput) {
    queueSearchInput.addEventListener('input', debounce(handleSearch, 300));
  }

  // Date picker
  if (queueDatePicker) {
    queueDatePicker.addEventListener('change', handleDateChange);
  }

  // Pagination
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => changePage(-1));
  }
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => changePage(1));
  }

  // Room modal
  if (roomModalClose) {
    roomModalClose.addEventListener('click', closeRoomModal);
  }
  if (roomModalCancel) {
    roomModalCancel.addEventListener('click', closeRoomModal);
  }
  if (roomModalConfirm) {
    roomModalConfirm.addEventListener('click', handleRoomAssign);
  }
  if (roomModalOverlay) {
    roomModalOverlay.addEventListener('click', (e) => {
      if (e.target === roomModalOverlay) {
        closeRoomModal();
      }
    });
  }
}

/**
 * Setup role-aware button visibility
 */
function setupRoleAwareButtons() {
  // Only doctors can call next and update status
  if (!isDoctor) {
    if (callNextBtn) {
      callNextBtn.style.display = 'none';
    }
  }

  // Only admins can reassign
  if (!isAdmin) {
    if (reassignBtn) {
      reassignBtn.style.display = 'none';
    }
  }
}

/**
 * Show/hide loading spinner
 */
function showSpinner(show) {
  if (loadingSpinner) {
    if (show) {
      loadingSpinner.classList.remove('hidden');
    } else {
      loadingSpinner.classList.add('hidden');
    }
  }
}

/**
 * Fetch queue data
 */
async function fetchQueue() {
  showSpinner(true);
  
  try {
    const params = new URLSearchParams();
    params.append('page', currentPage.toString());
    params.append('limit', '20');

    if (queueSearchInput && queueSearchInput.value.trim()) {
      params.append('search', queueSearchInput.value.trim());
    }

    if (queueDatePicker && queueDatePicker.value) {
      params.append('date', queueDatePicker.value);
    }

    const response = await apiGet(`/staff/queue?${params.toString()}`);
    const result = await response.json();

    if (result.success && result.data) {
      queueData = result.data.queueEntries || [];
      const pagination = result.data.pagination || {};
      currentPage = pagination.page || 1;
      totalPages = pagination.totalPages || 1;
      renderQueueTable();
      updateSummary();
      updatePaginationButtons();
      
      // Fetch doctor load info if doctor
      if (isDoctor) {
        await fetchDoctorLoad();
      }
    } else {
      toast.error(result.message || 'Failed to load queue');
      queueData = [];
      renderQueueTable();
    }
  } catch (error) {
    console.error('Error fetching queue:', error);
    toast.error('Failed to load queue data');
    queueData = [];
    renderQueueTable();
  } finally {
    showSpinner(false);
  }
}

/**
 * Render queue table
 */
function renderQueueTable() {
  if (!queueTableBody) return;

  if (queueData.length === 0) {
    // Check if user is a doctor (non-primary, non-admin) for role-specific message
    // Doctors see only assigned entries, so show doctor-specific message
    // Primary doctors and admins see hospital-wide, so show hospital message
    // Use the global flags set on init, but also check user object directly as fallback
    const userRole = user?.role;
    const userStaffRole = user?.staffRole;
    const userIsPrimary = user?.isPrimary === true || user?.isPrimary === 'true';
    
    // Doctor is: STAFF role + DOCTOR staffRole + not primary + not admin
    // Use global isDoctor flag if available, otherwise check directly
    const checkIsDoctor = isDoctor || (userRole === 'STAFF' && userStaffRole === 'DOCTOR');
    const checkIsPrimary = isPrimary || userIsPrimary;
    const checkIsAdmin = isAdmin || (userRole === 'ADMIN');
    
    const isRegularDoctor = checkIsDoctor && !checkIsPrimary && !checkIsAdmin;
    
    const emptyMessage = isRegularDoctor
      ? 'No active patients assigned to you.'
      : 'No active patients in this hospital.';
    
    queueTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">${emptyMessage}</td>
      </tr>
    `;
    return;
  }

  queueTableBody.innerHTML = queueData.map(entry => {
    const patient = entry.patient || {};
    const patientName = patient.fullName || 'Unknown';
    const patientInitials = getInitials(patientName);
    const ticketNumber = entry.ticketNumber || '-';
    const status = entry.status || 'WAITING';
    const statusClass = status.toLowerCase().replace('_', '_');
    const assignedRoom = entry.assignedRoom ? entry.assignedRoom.name : '-';

    return `
      <tr class="" data-entry-id="${entry.id}">
        <td>
          <span class="select-indicator">Select</span>
        </td>
        <td>
          <div class="patient-name-cell">
            <div class="patient-avatar">${patientInitials}</div>
            <span>${patientName}</span>
          </div>
        </td>
        <td>${ticketNumber}</td>
        <td>
          <span class="status-badge ${statusClass}">${formatStatus(status)}</span>
        </td>
        <td>In</td>
        <td>${assignedRoom}</td>
        <td>
          <div class="action-buttons">
            ${isDoctor && canUpdateStatus(entry) ? `
              <button class="action-btn status-update-btn" title="Update Status" data-entry-id="${entry.id}" data-status="${status}">
                <span class="material-symbols-outlined">check_circle</span>
              </button>
            ` : ''}
            <button class="action-btn" title="Call" onclick="handleCall('${entry.id}')">
              <span class="material-symbols-outlined">phone</span>
            </button>
            <button class="action-btn" title="Email" onclick="handleEmail('${entry.id}')">
              <span class="material-symbols-outlined">email</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach status update button listeners
  queueTableBody.querySelectorAll('.status-update-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const currentStatus = btn.dataset.status;
      await handleStatusUpdate(entryId, currentStatus, null, btn);
    });
  });

  // Attach row click for patient details
  queueTableBody.querySelectorAll('tr[data-entry-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (!e.target.closest('.action-btn')) {
        const entryId = row.dataset.entryId;
        const isSelected = row.classList.contains('selected-row');
        
        // Toggle selection
        if (isSelected) {
          row.classList.remove('selected-row');
          selectedQueueEntries.delete(entryId);
          hidePatientDetails();
        } else {
          // Remove selection from other rows
          queueTableBody.querySelectorAll('tr.selected-row').forEach(r => {
            r.classList.remove('selected-row');
            const otherEntryId = r.dataset.entryId;
            selectedQueueEntries.delete(otherEntryId);
          });
          row.classList.add('selected-row');
          selectedQueueEntries.add(entryId);
          showPatientDetails(entryId);
        }
        updateActionButtons();
      }
    });
  });
}

/**
 * Check if status can be updated
 */
function canUpdateStatus(entry) {
  if (!isDoctor) return false;
  if (!entry.assignedDoctor || entry.assignedDoctor.id !== user.id) return false;
  
  const allowedStatuses = ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'];
  return allowedStatuses.includes(entry.status);
}

/**
 * Format status for display
 */
function formatStatus(status) {
  return status.replace('_', ' ').toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get initials from name
 */
function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Remove select all functionality since checkbox is in sidebar

/**
 * Update selected state in table
 */
function updateSelectedState() {
  // Update row selection state
  queueTableBody.querySelectorAll('tr[data-entry-id]').forEach(row => {
    const entryId = row.dataset.entryId;
    if (selectedQueueEntries.has(entryId)) {
      row.classList.add('selected');
    } else {
      row.classList.remove('selected');
    }
  });

  // Update patient details checkbox if visible
  const patientCheckbox = patientDetailsCard?.querySelector('.patient-details-checkbox');
  if (patientCheckbox) {
    const entryId = patientCheckbox.dataset.entryId;
    patientCheckbox.checked = selectedQueueEntries.has(entryId);
  }
}

/**
 * Update action buttons state
 */
function updateActionButtons() {
  const hasSelection = selectedQueueEntries.size > 0;
  const canManage = isAdmin || isPrimary;
  
  if (notifyBtn) {
    notifyBtn.disabled = !hasSelection;
  }
  if (reassignBtn) {
    reassignBtn.disabled = !hasSelection || !canManage;
  }
  if (noShowBtn) {
    noShowBtn.disabled = !hasSelection || !canManage;
  }
}

/**
 * Handle call next
 */
async function handleCallNext() {
  if (!isDoctor) {
    toast.error('Only doctors can call next patient');
    return;
  }

  // Disable button during API call
  if (callNextBtn) {
    callNextBtn.disabled = true;
    callNextBtn.textContent = 'Calling...';
  }

  try {
    // Find next patient in queue (WAITING or TRIAGE)
    const nextEntry = queueData.find(entry => 
      entry.assignedDoctor && 
      entry.assignedDoctor.id === user.id &&
      (entry.status === 'WAITING' || entry.status === 'TRIAGE')
    );

    if (!nextEntry) {
      toast.info('No patients waiting in your queue');
      return;
    }

    // Transition to CALLED
    await updateQueueStatus(nextEntry.id, 'CALLED');
  } finally {
    // Re-enable button
    if (callNextBtn) {
      callNextBtn.disabled = false;
      callNextBtn.textContent = 'Call Next';
    }
  }
}

/**
 * Handle status update
 */
async function handleStatusUpdate(entryId, currentStatus, roomId = null, buttonEl = null) {
  if (!isDoctor) {
    toast.error('Only doctors can update status');
    return;
  }

  const entry = queueData.find(e => e.id === entryId);
  if (!entry) return;

  // Determine next status
  let nextStatus;
  if (currentStatus === 'WAITING') {
    nextStatus = 'TRIAGE';
  } else if (currentStatus === 'TRIAGE') {
    nextStatus = 'CALLED';
  } else if (currentStatus === 'CALLED') {
    // Show room modal for IN_CONSULTATION
    await openRoomModal(entryId);
    return;
  } else {
    toast.info('Invalid status transition');
    return;
  }

  await updateQueueStatus(entryId, nextStatus, roomId, buttonEl);
}

/**
 * Update queue entry status
 */
async function updateQueueStatus(entryId, status, roomId = null, buttonEl = null) {
  try {
    // Disable button during API call
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.style.opacity = '0.6';
      buttonEl.style.cursor = 'not-allowed';
    }

    const body = { status };
    if (roomId) {
      body.roomId = roomId;
    }

    const response = await apiPatch(`/queue/${entryId}/status`, body);
    const result = await response.json();

    if (result.success) {
      toast.success(`Status updated to ${formatStatus(status)}`);
      await fetchQueue();
      
      // Update doctor load badge after status change
      if (isDoctor) {
        await fetchDoctorLoad();
      }
    } else {
      toast.error(result.message || 'Failed to update status');
    }
  } catch (error) {
    console.error('Error updating status:', error);
    toast.error('Failed to update status');
  } finally {
    // Re-enable button after API call
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.style.opacity = '1';
      buttonEl.style.cursor = 'pointer';
    }
  }
}

/**
 * Open room modal
 */
async function openRoomModal(entryId) {
  currentQueueEntryId = entryId;
  
  const entry = queueData.find(e => e.id === entryId);
  if (!entry) return;

  // Fetch available rooms for the department
  await fetchRooms(entry.department.id);

  if (roomModalOverlay) {
    roomModalOverlay.classList.add('active');
  }
}

/**
 * Fetch available rooms
 */
async function fetchRooms(departmentId) {
  try {
    const response = await apiGet(`/rooms?departmentId=${departmentId}&includeInactive=false`);
    const result = await response.json();

    if (result.success && result.data) {
      availableRooms = result.data.rooms || [];
      renderRoomList();
    } else {
      availableRooms = [];
      renderRoomList();
    }
  } catch (error) {
    console.error('Error fetching rooms:', error);
    availableRooms = [];
    renderRoomList();
  }
}

/**
 * Render room list
 */
function renderRoomList() {
  if (!roomList) return;

  if (availableRooms.length === 0) {
    roomList.innerHTML = '<div class="loading-message">No rooms available</div>';
    if (roomModalConfirm) {
      roomModalConfirm.disabled = true;
    }
    return;
  }

  roomList.innerHTML = availableRooms.map(room => `
    <div class="room-item" data-room-id="${room.id}">
      <div class="room-item-name">${room.name}</div>
    </div>
  `).join('');

  // Attach room selection listeners
  roomList.querySelectorAll('.room-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.classList.contains('inactive')) return;
      
      // Remove previous selection
      roomList.querySelectorAll('.room-item').forEach(i => i.classList.remove('selected'));
      
      // Add selection
      item.classList.add('selected');
      
      // Enable confirm button
      if (roomModalConfirm) {
        roomModalConfirm.disabled = false;
      }
    });
  });

  if (roomModalConfirm) {
    roomModalConfirm.disabled = true;
  }
}

/**
 * Handle room assignment
 */
async function handleRoomAssign() {
  if (!currentQueueEntryId) return;

  const selectedRoom = roomList.querySelector('.room-item.selected');
  if (!selectedRoom) {
    toast.error('Please select a room');
    return;
  }

  // Disable confirm button during API call
  if (roomModalConfirm) {
    roomModalConfirm.disabled = true;
    roomModalConfirm.textContent = 'Assigning...';
  }

  const roomId = selectedRoom.dataset.roomId;
  await updateQueueStatus(currentQueueEntryId, 'IN_CONSULTATION', roomId);
  closeRoomModal();
  
  // Re-enable button
  if (roomModalConfirm) {
    roomModalConfirm.disabled = false;
    roomModalConfirm.textContent = 'Assign Room';
  }
}

/**
 * Close room modal
 */
function closeRoomModal() {
  if (roomModalOverlay) {
    roomModalOverlay.classList.remove('active');
  }
  currentQueueEntryId = null;
  if (roomList) {
    roomList.innerHTML = '';
  }
  if (roomModalConfirm) {
    roomModalConfirm.disabled = true;
  }
}

/**
 * Handle notify
 */
function handleNotify() {
  if (selectedQueueEntries.size === 0) {
    toast.info('Please select patients to notify');
    return;
  }
  toast.info('Notify feature coming soon');
}

/**
 * Handle reassign
 */
function handleReassign() {
  if (selectedQueueEntries.size === 0) {
    toast.info('Please select patients to reassign');
    return;
  }
  toast.info('Reassign feature coming soon');
}

/**
 * Handle no-show
 */
async function handleNoShow() {
  if (selectedQueueEntries.size === 0) {
    toast.info('Please select patients to mark as no-show');
    return;
  }

  if (!isAdmin) {
    toast.error('Only admins can mark patients as no-show');
    return;
  }

  // TODO: Implement bulk no-show
  toast.info('Bulk no-show feature coming soon');
}

/**
 * Handle call
 */
window.handleCall = function(entryId) {
  toast.info('Call feature coming soon');
};

/**
 * Handle email
 */
window.handleEmail = function(entryId) {
  toast.info('Email feature coming soon');
};

/**
 * Show patient details
 */
function showPatientDetails(entryId) {
  const entry = queueData.find(e => e.id === entryId);
  if (!entry || !patientDetailsCard) return;

  const patient = entry.patient || {};
  const patientName = patient.fullName || 'Unknown';
  const patientInitials = getInitials(patientName);
  const isSelected = selectedQueueEntries.has(entryId);

  // Show sidebar and adjust main content
  const sidebar = document.getElementById('queue-sidebar');
  const queueView = document.querySelector('.queue-view');
  
  if (sidebar) {
    sidebar.classList.add('visible');
  }
  if (queueView) {
    queueView.classList.add('has-selected-patient');
  }

  patientDetailsCard.innerHTML = `
    <div class="patient-details-header">
      <div class="patient-details-avatar">${patientInitials}</div>
      <div class="patient-details-name">${patientName}</div>
      <div class="patient-details-info">${patient.age || 'N/A'}/${patient.gender || 'N/A'}</div>
    </div>
    <div class="patient-details-checkbox-section">
      <label class="patient-checkbox-label">
        <input 
          type="checkbox" 
          class="patient-details-checkbox" 
          data-entry-id="${entryId}"
          ${isSelected ? 'checked' : ''}
        />
        <span>Select patient</span>
      </label>
    </div>
    <div class="patient-details-section">
      <div class="patient-details-section-title">Queue History</div>
      <div class="patient-details-section-content">
        Visit 1: ${new Date(entry.checkInTime).toLocaleDateString()}
      </div>
    </div>
    <div class="patient-details-section">
      <div class="patient-details-section-title">Notes</div>
      <div class="patient-details-section-content">
        ${entry.appointment?.reason || 'No notes available'}
      </div>
    </div>
  `;

  // Attach checkbox listener in patient details
  const patientCheckbox = patientDetailsCard.querySelector('.patient-details-checkbox');
  if (patientCheckbox) {
    patientCheckbox.addEventListener('change', (e) => {
      e.stopPropagation(); // Prevent any event bubbling
      const entryId = e.target.dataset.entryId;
      if (e.target.checked) {
        selectedQueueEntries.add(entryId);
      } else {
        selectedQueueEntries.delete(entryId);
      }
      updateSelectedState();
      updateActionButtons();
    });
  }
}

/**
 * Hide patient details
 */
function hidePatientDetails() {
  const sidebar = document.getElementById('queue-sidebar');
  const queueView = document.querySelector('.queue-view');
  
  if (sidebar) {
    sidebar.classList.remove('visible');
  }
  if (queueView) {
    queueView.classList.remove('has-selected-patient');
  }
  
  if (patientDetailsCard) {
    patientDetailsCard.innerHTML = `
      <div class="patient-details-placeholder">
        <p>Select a patient to view details</p>
      </div>
    `;
  }
}

/**
 * Handle search
 */
function handleSearch() {
  currentPage = 1;
  fetchQueue();
}

/**
 * Handle date change
 */
function handleDateChange() {
  currentPage = 1;
  fetchQueue();
}

/**
 * Change page
 */
function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    fetchQueue();
  }
}

/**
 * Update summary
 */
function updateSummary() {
  if (!queueSummaryText) return;

  const waiting = queueData.filter(e => e.status === 'WAITING').length;
  const inProgress = queueData.filter(e => e.status === 'IN_CONSULTATION').length;
  const completed = queueData.filter(e => e.status === 'COMPLETED').length;

  queueSummaryText.textContent = 
    `${waiting} patients waiting, ${inProgress} in progress, ${completed} completed today`;
}

/**
 * Update pagination buttons
 */
function updatePaginationButtons() {
  if (prevPageBtn) {
    prevPageBtn.disabled = currentPage <= 1;
  }
  if (nextPageBtn) {
    nextPageBtn.disabled = currentPage >= totalPages;
  }
}

/**
 * Fetch doctor load information
 */
async function fetchDoctorLoad() {
  if (!isDoctor || !doctorLoadBadge) return;

  try {
    // Get doctor load from user object (from auth middleware)
    if (user && user.currentActivePatients !== undefined && user.maxConcurrentPatients !== undefined) {
      const current = user.currentActivePatients || 0;
      const max = user.maxConcurrentPatients || 3;
      
      doctorLoadBadge.textContent = `Active Patients: ${current} / ${max}`;
      doctorLoadBadge.classList.remove('hidden');
    } else {
      // Fallback: fetch from API if user object doesn't have load info
      const response = await apiGet('/staff/dashboard');
      const result = await response.json();
      
      if (result.success && result.data && result.data.user) {
        const current = result.data.user.currentActivePatients || 0;
        const max = result.data.user.maxConcurrentPatients || 3;
        
        doctorLoadBadge.textContent = `Active Patients: ${current} / ${max}`;
        doctorLoadBadge.classList.remove('hidden');
        
        // Update user object with load info
        user.currentActivePatients = current;
        user.maxConcurrentPatients = max;
      }
    }
  } catch (error) {
    console.error('Error fetching doctor load:', error);
    // Silently fail - load badge is optional
  }
}

/**
 * Start polling
 */
function startPolling() {
  // Clear existing interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  // Poll every 10 seconds
  pollingInterval = setInterval(() => {
    fetchQueue();
  }, 10000);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Debounce helper
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

// Initialize when view is loaded
window.addEventListener('view-loaded', (e) => {
  if (e.detail.route === 'queues') {
    initQueuePage();
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopPolling();
});
