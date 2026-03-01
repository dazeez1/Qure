/**
 * Queue Control Page
 * Handles queue management for staff
 */

'use strict';

import { apiGet, apiPatch } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { API_ENDPOINTS } from '../../config/api.js';

// State
let queueData = [];
let selectedQueueEntries = new Set();
let currentPage = 1;
let totalPages = 1;
let pollingInterval = null;
let currentQueueEntryId = null; // For room assignment
let availableRooms = [];
let waitingAreas = []; // Store waiting areas with occupancy

// DOM Elements
let queueTableBody;
let selectAllCheckbox;
let callNextBtn;
let notifyBtn;
let reassignBtn;
let noShowBtn;
let queueSearchInput;
let queueDateRangeBtn;
let queueDateRangePanel;
let queueStartDateInput;
let queueEndDateInput;
let queueApplyDateBtn;
let queueClearDateBtn;
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
async function initQueuePage() {
  console.log('initQueuePage called');
  
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
  queueDateRangeBtn = document.getElementById('queue-date-range-btn');
  queueDateRangePanel = document.getElementById('queue-date-range-panel');
  queueStartDateInput = document.getElementById('queue-start-date-input');
  queueEndDateInput = document.getElementById('queue-end-date-input');
  queueApplyDateBtn = document.getElementById('queue-apply-date-btn');
  queueClearDateBtn = document.getElementById('queue-clear-date-btn');
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
  
  // Verify critical DOM elements exist
  if (!queueTableBody) {
    console.error('queue-table-body not found!');
    toast.error('Queue table not found. Please refresh the page.');
    return;
  }
  
  // Sidebar close button
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', hidePatientDetails);
  }

  // Setup date range filter
  setupDateRangeFilter();

  // Setup event listeners
  setupEventListeners();

  // Setup role-aware button visibility
  setupRoleAwareButtons();

  // Initial load - ensure it completes
  console.log('Starting initial queue fetch...');
  try {
    await fetchQueue();
    console.log('Initial queue fetch completed');
    
    // Fetch waiting areas
    await fetchWaitingAreas();
    
    // Fetch doctor load on initial load
    if (isDoctor) {
      await fetchDoctorLoad();
    }
  } catch (error) {
    console.error('Error during initial load:', error);
    toast.error('Failed to load queue data. Please refresh the page.');
  }

  // Start polling after initial load completes
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

  // Date range filter is set up in setupDateRangeFilter()

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

  // Move dropdown toggle
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('move-btn')) {
      e.stopPropagation();
      const wrapper = e.target.closest('.move-wrapper');
      if (wrapper) {
        const dropdown = wrapper.querySelector('.move-dropdown');

        // Close all other dropdowns
        document.querySelectorAll('.move-dropdown').forEach(d => {
          if (d !== dropdown) d.classList.add('hidden');
        });

        // Toggle current dropdown
        if (dropdown) {
          dropdown.classList.toggle('hidden');
        }
      }
    } else if (!e.target.closest('.move-dropdown') && !e.target.closest('.move-btn')) {
      // Close all dropdowns when clicking outside
      document.querySelectorAll('.move-dropdown').forEach(d => {
        d.classList.add('hidden');
      });
    }
  });
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
 * @param {boolean} showLoading - Whether to show loading spinner (default: true)
 */
async function fetchQueue(showLoading = true) {
  console.log('fetchQueue called, showLoading:', showLoading);
  
  // Clear loading message immediately when starting to fetch
  if (queueTableBody) {
    if (queueTableBody.querySelector('.loading-message')) {
      queueTableBody.innerHTML = '';
    }
  } else {
    console.warn('queueTableBody is null in fetchQueue');
  }
  
  if (showLoading) {
    showSpinner(true);
  }
  
  try {
    const params = new URLSearchParams();
    params.append('page', currentPage.toString());
    params.append('limit', '10');

    if (queueSearchInput && queueSearchInput.value.trim()) {
      params.append('search', queueSearchInput.value.trim());
    }

    // Date range filter
    if (queueStartDateInput && queueStartDateInput.value) {
      params.append('dateFrom', queueStartDateInput.value);
    }
    if (queueEndDateInput && queueEndDateInput.value) {
      params.append('dateTo', queueEndDateInput.value);
    }

    const endpoint = `/staff/queue?${params.toString()}`;
    console.log('Fetching queue from:', endpoint);
    
    const response = await apiGet(endpoint);
    console.log('Queue API response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Queue API result:', result);

    if (result.success && result.data) {
      queueData = result.data.queueEntries || [];
      const pagination = result.data.pagination || {};
      currentPage = pagination.page || 1;
      totalPages = pagination.totalPages || 1;
      await renderQueueTable();
      updateSummary();
      updatePaginationButtons();
      
      // Fetch doctor load info if doctor
      if (isDoctor) {
        await fetchDoctorLoad();
      }

      // Refresh waiting areas after queue data is loaded
      await fetchWaitingAreas();
    } else {
      toast.error(result.message || 'Failed to load queue');
      queueData = [];
      await renderQueueTable();
    }
  } catch (error) {
    console.error('Error fetching queue:', error);
    toast.error('Failed to load queue data');
    queueData = [];
    await renderQueueTable();
  } finally {
    if (showLoading) {
      showSpinner(false);
    }
  }
}

/**
 * Render queue table
 */
async function renderQueueTable() {
  if (!queueTableBody) return;

  // Clear loading message first
  queueTableBody.innerHTML = '';

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

    const isSelected = selectedQueueEntries.has(entry.id);
    return `
      <tr class="" data-entry-id="${entry.id}">
        <td>
          <input 
            type="checkbox" 
            class="queue-checkbox" 
            data-entry-id="${entry.id}"
            ${isSelected ? 'checked' : ''}
          />
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
        <td class="actions-cell">
          <button class="action-btn" title="Call" onclick="handleCall('${entry.id}')" data-entry-id="${entry.id}">
            <span class="material-symbols-outlined">phone</span>
          </button>
          <button class="action-btn" title="Email" onclick="handleEmail('${entry.id}')" data-entry-id="${entry.id}">
            <span class="material-symbols-outlined">email</span>
          </button>
          ${isDoctor && canUpdateStatus(entry) ? `
            <button class="action-btn status-update-btn" title="Complete/Update Status" data-entry-id="${entry.id}" data-status="${status}">
              <span class="material-symbols-outlined">check_circle</span>
            </button>
          ` : ''}
          <div class="move-wrapper">
            <button class="move-btn" data-entry-id="${entry.id}">Move ▾</button>
            <div class="move-dropdown hidden" data-queue-id="${entry.id}">
              <!-- populated dynamically -->
            </div>
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

  // Populate move dropdowns after rendering
  await populateMoveDropdowns();

  // Attach checkbox listeners
  queueTableBody.querySelectorAll('.queue-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const entryId = e.target.dataset.entryId;
      const row = e.target.closest('tr[data-entry-id]');
      
      if (e.target.checked) {
        selectedQueueEntries.add(entryId);
        if (row) row.classList.add('selected-row');
        showPatientDetails(entryId);
      } else {
        selectedQueueEntries.delete(entryId);
        if (row) row.classList.remove('selected-row');
        if (selectedQueueEntries.size === 0) {
          hidePatientDetails();
        }
      }
      updateActionButtons();
    });
  });

  // Attach row click for patient details (but not on checkbox or action buttons)
  queueTableBody.querySelectorAll('tr[data-entry-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't trigger row selection if clicking on checkbox, action buttons, or move dropdown
      if (!e.target.closest('.queue-checkbox') && !e.target.closest('.action-btn') && !e.target.closest('.move-wrapper')) {
        const entryId = row.dataset.entryId;
        const isSelected = row.classList.contains('selected-row');
        
        // Toggle selection
        if (isSelected) {
          row.classList.remove('selected-row');
          selectedQueueEntries.delete(entryId);
          const checkbox = row.querySelector('.queue-checkbox');
          if (checkbox) checkbox.checked = false;
          if (selectedQueueEntries.size === 0) {
            hidePatientDetails();
          } else {
            // Show details for the first selected entry
            const firstSelectedId = Array.from(selectedQueueEntries)[0];
            showPatientDetails(firstSelectedId);
          }
        } else {
          // Remove selection from other rows
          queueTableBody.querySelectorAll('tr.selected-row').forEach(r => {
            r.classList.remove('selected-row');
            const otherEntryId = r.dataset.entryId;
            selectedQueueEntries.delete(otherEntryId);
            const otherCheckbox = r.querySelector('.queue-checkbox');
            if (otherCheckbox) otherCheckbox.checked = false;
          });
          row.classList.add('selected-row');
          selectedQueueEntries.add(entryId);
          const checkbox = row.querySelector('.queue-checkbox');
          if (checkbox) checkbox.checked = true;
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

  patientDetailsCard.innerHTML = `
    <div class="patient-details-header">
      <div class="patient-details-avatar">${patientInitials}</div>
      <div class="patient-details-name">${patientName}</div>
      <div class="patient-details-info">${patient.age || 'N/A'}/${patient.gender || 'N/A'}</div>
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
}

/**
 * Hide patient details
 */
function hidePatientDetails() {
  const sidebar = document.getElementById('queue-sidebar');
  
  if (sidebar) {
    sidebar.classList.remove('visible');
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
 * Setup date range filter
 */
function setupDateRangeFilter() {
  if (!queueDateRangeBtn || !queueDateRangePanel) return;

  // Toggle panel visibility
  queueDateRangeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    queueDateRangePanel.classList.toggle('visible');
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!queueDateRangePanel.contains(e.target) && !queueDateRangeBtn.contains(e.target)) {
      queueDateRangePanel.classList.remove('visible');
    }
  });

  // Apply date filter
  if (queueApplyDateBtn) {
    queueApplyDateBtn.addEventListener('click', () => {
      queueDateRangePanel.classList.remove('visible');
      currentPage = 1;
      fetchQueue();
    });
  }

  // Clear date filter
  if (queueClearDateBtn) {
    queueClearDateBtn.addEventListener('click', () => {
      if (queueStartDateInput) queueStartDateInput.value = '';
      if (queueEndDateInput) queueEndDateInput.value = '';
      queueDateRangePanel.classList.remove('visible');
      currentPage = 1;
      fetchQueue();
    });
  }
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

  // Poll every 10 seconds (without showing spinner)
  pollingInterval = setInterval(() => {
    fetchQueue(false); // Don't show spinner during automatic polling
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
 * Fetch waiting areas
 */
async function fetchWaitingAreas() {
  try {
    const response = await apiGet('/waiting-areas');
    const result = await response.json();

    if (result.success && result.data) {
      waitingAreas = result.data.waitingAreas || [];
      
      // Calculate occupancy for each waiting area
      for (const area of waitingAreas) {
        const occupancy = queueData.filter(entry => 
          entry.waitingArea && 
          entry.waitingArea.id === area.id &&
          ['WAITING', 'TRIAGE', 'CALLED'].includes(entry.status)
        ).length;
        area.currentOccupancy = occupancy;
      }
    }
  } catch (error) {
    console.error('Error fetching waiting areas:', error);
    waitingAreas = [];
  }
}

/**
 * Populate move dropdowns with waiting areas
 */
async function populateMoveDropdowns() {
  // Refresh waiting areas with current queue data
  await fetchWaitingAreas();

  document.querySelectorAll('.move-dropdown').forEach(dropdown => {
    dropdown.innerHTML = '';

    if (waitingAreas.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'move-dropdown-empty';
      emptyMsg.textContent = 'No waiting areas available';
      emptyMsg.style.padding = '8px 10px';
      emptyMsg.style.fontSize = '13px';
      emptyMsg.style.color = '#aaa';
      dropdown.appendChild(emptyMsg);
      return;
    }

    waitingAreas.forEach(area => {
      const btn = document.createElement('button');
      const occupancy = area.currentOccupancy || 0;
      const isFull = occupancy >= area.capacity;
      
      btn.textContent = `${area.name} (${occupancy}/${area.capacity})`;
      btn.disabled = isFull;
      
      if (isFull) {
        btn.style.cursor = 'not-allowed';
      }

      btn.onclick = (e) => {
        e.stopPropagation();
        const queueId = dropdown.dataset.queueId;
        assignWaitingArea(queueId, area.id);
      };

      dropdown.appendChild(btn);
    });
  });
}

/**
 * Assign waiting area to queue entry
 */
async function assignWaitingArea(queueId, waitingAreaId) {
  try {
    // Close all dropdowns
    document.querySelectorAll('.move-dropdown').forEach(d => {
      d.classList.add('hidden');
    });

    // Find the entry to get current status
    const entry = queueData.find(e => e.id === queueId);
    if (!entry) {
      toast.error('Queue entry not found');
      return;
    }

    // Determine target status (must be WAITING, TRIAGE, or CALLED)
    let targetStatus = entry.status;
    if (!['WAITING', 'TRIAGE', 'CALLED'].includes(targetStatus)) {
      // If current status doesn't allow waiting area, transition to WAITING first
      targetStatus = 'WAITING';
    }

    const response = await apiPatch(`/queue/${queueId}/status`, {
      status: targetStatus,
      waitingAreaId: waitingAreaId,
    });

    const result = await response.json();

    if (result.success) {
      toast.success(`Patient moved to ${waitingAreas.find(a => a.id === waitingAreaId)?.name || 'waiting area'}`);
      await fetchQueue(false); // Refresh queue without spinner
    } else {
      toast.error(result.message || 'Failed to assign waiting area');
    }
  } catch (error) {
    console.error('Error assigning waiting area:', error);
    toast.error('Failed to assign waiting area');
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

// Register event listener immediately when module loads
window.addEventListener('view-loaded', async (e) => {
  if (e.detail.route === 'queues') {
    console.log('view-loaded event received for queues route');
    // Wait a bit to ensure DOM is fully ready
    setTimeout(() => {
      initQueuePage().catch(err => {
        console.error('Error initializing queue page:', err);
        toast.error('Failed to initialize queue page');
      });
    }, 150);
  }
}, { once: false }); // Allow multiple calls if needed

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopPolling();
});
