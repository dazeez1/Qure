/**
 * Queue Control Page
 * Handles queue management for staff
 */

'use strict';

import { apiGet, apiPatch, apiPost } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { showConfirmModal } from '../../utils/modal.js';
import { initPage, cleanupPage, addButtonListener, addListener, addScopedDocumentListener } from '../../utils/pageLifecycle.js';

// State
let queueData = [];
let selectedQueueEntries = new Set();
let currentPage = 1;
let totalPages = 1;
let pollingInterval = null;
let waitTimePollingInterval = null; // Separate interval for wait time updates
let currentQueueEntryId = null; // For room assignment
let availableRooms = [];
let waitingAreas = []; // Store waiting areas with occupancy
let waitTimeCache = new Map(); // Cache wait times by entry ID
let waitTimeSSEConnections = new Map(); // Map of active SSE connections by entry ID

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
let queueStatusBtn;
let queueStatusPanel;
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

// Page ID for lifecycle management
const PAGE_ID = 'queue';

// Cleanup functions storage
let cleanupFunctions = [];

/**
 * Load modal CSS for queue page only
 */
function loadModalCSS() {
  // Check if modal CSS is already loaded for this page
  const existingLink = document.getElementById('queue-modal-css');
  if (existingLink) {
    return; // Already loaded
  }

  // Create and append link element
  const link = document.createElement('link');
  link.id = 'queue-modal-css';
  link.rel = 'stylesheet';
  link.href = '/src/styles/modal.css';
  document.head.appendChild(link);
}

/**
 * Initialize queue page (internal)
 */
async function _initQueuePage() {
  console.log('initQueuePage called');
  
  // Load modal CSS for this page only
  loadModalCSS();
  
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
  queueStatusBtn = document.getElementById('queue-status-btn');
  queueStatusPanel = document.getElementById('queue-status-panel');
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
    toast.error('Queue table not found');
    return;
  }
  
  // Verify room modal elements exist (but don't show error, it's optional)
  if (!roomModalOverlay) {
    console.warn('Room modal overlay not found - room assignment feature may not work');
  }
  
  // Sidebar close button
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  if (sidebarCloseBtn) {
    cleanupFunctions.push(
      addButtonListener(sidebarCloseBtn, PAGE_ID, hidePatientDetails)
    );
  }

  // Setup date range filter
  setupDateRangeFilter();

  // Setup status filter
  setupStatusFilter();

  // Setup event listeners
  setupEventListeners();

  // Setup role-aware button visibility
  setupRoleAwareButtons();

  // Initial load - ensure it completes
  try {
    await fetchQueue();
    
    // Fetch waiting areas
    await fetchWaitingAreas();
    
    // Fetch doctor load on initial load
    if (isDoctor) {
      await fetchDoctorLoad();
    }
  } catch (error) {
    console.error('Error during initial load:', error);
    toast.error('Failed to load queue data');
  }

  // Start polling after initial load completes
  startPolling();
  
  // Pause polling when page becomes hidden, resume when visible
  cleanupFunctions.push(
    addListener(PAGE_ID, document, 'visibilitychange', () => {
    if (document.hidden) {
      // Page is hidden - pause polling and close SSE connections
      stopPolling();
    } else {
      // Page is visible - resume polling
      startPolling();
    }
    })
  );
}

/**
 * Wait for DOM element to be available
 */
function waitForElement(selector, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      } else {
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }
    }, timeout);
  });
}

/**
 * Initialize queue page with lifecycle management
 */
async function initQueuePage() {
  // Get page container
  const pageContainer = document.getElementById('app-content');
  if (!pageContainer) {
    console.error('Page container not found');
    return;
  }

  // Clear previous cleanup functions
  cleanupFunctions.forEach(cleanup => cleanup());
  cleanupFunctions = [];

  // Wait for critical buttons to be available before initializing
  try {
    await Promise.race([
      waitForElement('#notify-btn'),
      waitForElement('#reassign-btn'),
      waitForElement('#no-show-btn'),
      new Promise(resolve => setTimeout(resolve, 200)) // Max wait 200ms
    ]);
  } catch (error) {
    console.warn('Some buttons not found, continuing anyway:', error);
  }

  // Initialize with lifecycle management
  await initPage(PAGE_ID, pageContainer, _initQueuePage);
}

/**
 * Setup event listeners with isolated handlers
 */
function setupEventListeners() {
  // Re-query buttons to ensure they exist (DOM might not be ready when variables were set)
  const callNextBtnEl = document.getElementById('call-next-btn');
  const notifyBtnEl = document.getElementById('notify-btn');
  const reassignBtnEl = document.getElementById('reassign-btn');
  const noShowBtnEl = document.getElementById('no-show-btn');
  
  // Debug: Log if buttons are found
  if (!notifyBtnEl) console.warn('Notify button not found!');
  if (!reassignBtnEl) console.warn('Reassign button not found!');
  if (!noShowBtnEl) console.warn('No-show button not found!');
  
  // Action buttons - using isolated button listeners
  cleanupFunctions.push(
    addButtonListener(callNextBtnEl, PAGE_ID, handleCallNext),
    addButtonListener(notifyBtnEl, PAGE_ID, handleNotify),
    addButtonListener(reassignBtnEl, PAGE_ID, handleReassign),
    addButtonListener(noShowBtnEl, PAGE_ID, handleNoShow)
  );
  
  // Update global references
  callNextBtn = callNextBtnEl;
  notifyBtn = notifyBtnEl;
  reassignBtn = reassignBtnEl;
  noShowBtn = noShowBtnEl;

  // Search
  if (queueSearchInput) {
    cleanupFunctions.push(
      addListener(PAGE_ID, queueSearchInput, 'input', debounce(handleSearch, 300))
    );
  }

  // Date range filter is set up in setupDateRangeFilter()

  // Pagination - re-query to ensure elements exist
  const prevPageBtnEl = document.getElementById('prev-page-btn');
  const nextPageBtnEl = document.getElementById('next-page-btn');
  cleanupFunctions.push(
    addButtonListener(prevPageBtnEl, PAGE_ID, () => changePage(-1)),
    addButtonListener(nextPageBtnEl, PAGE_ID, () => changePage(1))
  );
  prevPageBtn = prevPageBtnEl;
  nextPageBtn = nextPageBtnEl;

  // Room modal - re-query to ensure elements exist
  const roomModalOverlayEl = document.getElementById('room-modal-overlay');
  const roomModalCloseEl = document.getElementById('room-modal-close');
  const roomModalCancelEl = document.getElementById('room-modal-cancel');
  const roomModalConfirmEl = document.getElementById('room-modal-confirm');
  
  if (roomModalCloseEl) {
    cleanupFunctions.push(
      addButtonListener(roomModalCloseEl, PAGE_ID, closeRoomModal)
    );
  }
  if (roomModalCancelEl) {
    cleanupFunctions.push(
      addButtonListener(roomModalCancelEl, PAGE_ID, closeRoomModal)
    );
  }
  if (roomModalConfirmEl) {
    cleanupFunctions.push(
      addButtonListener(roomModalConfirmEl, PAGE_ID, handleRoomAssign)
    );
  }
  if (roomModalOverlayEl) {
    cleanupFunctions.push(
      addListener(PAGE_ID, roomModalOverlayEl, 'click', (e) => {
        if (e.target === roomModalOverlayEl) {
        closeRoomModal();
      }
      })
    );
  }
  
  // Update global references
  roomModalOverlay = roomModalOverlayEl;
  roomModalClose = roomModalCloseEl;
  roomModalCancel = roomModalCancelEl;
  roomModalConfirm = roomModalConfirmEl;

  // Move dropdown toggle
  // Move dropdown functionality removed - use Waiting Area page instead
}

/**
 * Setup role-aware button visibility
 */
function setupRoleAwareButtons() {
  // Only doctors can call next and update status
  if (!isDoctor) {
    if (callNextBtn) {
      callNextBtn.disabled = true;
      callNextBtn.style.cursor = 'not-allowed';
      callNextBtn.title = 'Only doctors can call next patient';
    }
  }

  // Only admins/primary can reassign
  if (!isAdmin && !isPrimary) {
    if (reassignBtn) {
      reassignBtn.disabled = true;
      reassignBtn.style.cursor = 'not-allowed';
      reassignBtn.title = 'Only admins and primary staff can reassign patients';
    }
  }

  // Only admins/primary can mark no-show
  if (!isAdmin && !isPrimary) {
    if (noShowBtn) {
      noShowBtn.disabled = true;
      noShowBtn.style.cursor = 'not-allowed';
      noShowBtn.title = 'Only admins and primary staff can mark no-show';
    }
  }

  // Only admins/primary can notify
  if (!isAdmin && !isPrimary) {
    if (notifyBtn) {
      notifyBtn.disabled = true;
      notifyBtn.style.cursor = 'not-allowed';
      notifyBtn.title = 'Only admins and primary staff can notify patients';
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

    // Status filter
    const statusRadio = document.querySelector('input[name="queue-status"]:checked');
    if (statusRadio && statusRadio.value) {
      params.append('status', statusRadio.value);
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
      
      // Restart SSE connections with updated queue data
      // Only restart if page is visible
      if (pollingInterval && !document.hidden) {
        startWaitTimeSSE();
      }
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
    
    // Restart SSE connections with updated queue data
    // Only restart if page is visible
    if (pollingInterval && !document.hidden) {
      startWaitTimeSSE();
    }
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
    const priority = entry.priority || 'NORMAL';
    const priorityColors = {
      URGENT: '#ef4444',
      HIGH: '#f97316',
      NORMAL: '#3b82f6',
      LOW: '#6b7280',
    };
    const priorityColor = priorityColors[priority] || priorityColors.NORMAL;

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
        <td>
          ${(isAdmin || isPrimary) ? `
            <select class="priority-select" data-entry-id="${entry.id}" style="padding: 0.4rem 0.6rem; border: 1px solid #e0e0e0; border-radius: 0.4rem; font-size: 1rem; background: white; color: ${priorityColor}; font-weight: 500;">
              <option value="URGENT" ${priority === 'URGENT' ? 'selected' : ''} style="color: #ef4444;">Urgent</option>
              <option value="HIGH" ${priority === 'HIGH' ? 'selected' : ''} style="color: #f97316;">High</option>
              <option value="NORMAL" ${priority === 'NORMAL' ? 'selected' : ''} style="color: #3b82f6;">Normal</option>
              <option value="LOW" ${priority === 'LOW' ? 'selected' : ''} style="color: #6b7280;">Low</option>
            </select>
          ` : `
            <span style="color: ${priorityColor}; font-weight: 500;">${priority}</span>
          `}
        </td>
        <td>${assignedRoom}</td>
        <td class="actions-cell">
          <button class="action-btn call-btn" title="Call" onclick="handleCall('${entry.id}')" data-entry-id="${entry.id}" style="color: #10b981; pointer-events: auto; cursor: pointer;">
            <span class="material-symbols-outlined">phone</span>
          </button>
          ${isDoctor && canUpdateStatus(entry) ? `
            <button class="action-btn status-update-btn check-btn" title="${status === 'WAITING' ? 'Move to TRIAGE' : status === 'TRIAGE' ? 'Move to CALLED' : status === 'CALLED' ? 'Start Consultation (Select Room)' : status === 'IN_CONSULTATION' ? 'Complete Consultation' : 'Update Status'}" data-entry-id="${entry.id}" data-status="${status}" style="color: #6366f1; pointer-events: auto; cursor: pointer; position: relative; z-index: 10;">
              <span class="material-symbols-outlined">check_circle</span>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  // Attach status update button listeners (use event delegation for better reliability)
  // Remove old listeners first
  queueTableBody.querySelectorAll('.status-update-btn').forEach(btn => {
    // Remove any existing event listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
  });
  
  // Use event delegation on the table body for better reliability
  queueTableBody.addEventListener('click', async (e) => {
    const checkBtn = e.target.closest('.status-update-btn');
    if (!checkBtn) return;
    
      e.stopPropagation();
    e.preventDefault();
    
    const entryId = checkBtn.dataset.entryId;
    const currentStatus = checkBtn.dataset.status;
    
    // Find the actual entry to get the most current status
    const entry = queueData.find(e => e.id === entryId);
    if (!entry) {
      toast.error('Queue entry not found');
      return;
    }
    
    // Use actual entry status
    const actualStatus = entry.status || currentStatus;
    
    // Verify button is not disabled
    if (checkBtn.disabled) {
      return;
    }
    
    await handleStatusUpdate(entryId, actualStatus, null, checkBtn);
  });

  // Move dropdown functionality removed - use Waiting Area page instead

  // Attach priority change listeners (Admin/Primary only)
  if (isAdmin || isPrimary) {
    queueTableBody.querySelectorAll('.priority-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        e.stopPropagation();
        const entryId = select.dataset.entryId;
        const newPriority = select.value;
        
        try {
          const response = await apiPatch(`/queue/${entryId}/priority`, { priority: newPriority });
          const result = await response.json();

          if (result.success) {
            toast.success('Priority updated');
            await fetchQueue(false);
          } else {
            toast.error(result.message || 'Failed to update priority');
            // Revert selection
            await fetchQueue(false);
          }
        } catch (error) {
          console.error('Error updating priority:', error);
          toast.error('Failed to update priority');
          // Revert selection
          await fetchQueue(false);
        }
      });
    });
  }

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
      // Don't trigger row selection if clicking on checkbox or action buttons
      if (!e.target.closest('.queue-checkbox') && !e.target.closest('.action-btn')) {
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
  
  // Check if any selected entries are CALLED or IN_CONSULTATION
  let hasCalledOrInConsultation = false;
  if (hasSelection) {
    hasCalledOrInConsultation = Array.from(selectedQueueEntries).some(entryId => {
      const entry = queueData.find(e => e.id === entryId);
      return entry && (entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION');
    });
  }
  
  if (notifyBtn) {
    // Disable if no selection, no permission, or selected patients are called/in consultation
    const shouldDisable = !hasSelection || !canManage || hasCalledOrInConsultation;
    notifyBtn.disabled = shouldDisable;
    
    if (!canManage) {
      notifyBtn.style.cursor = 'not-allowed';
      notifyBtn.title = 'Only admins and primary staff can notify patients';
    } else if (hasCalledOrInConsultation) {
      notifyBtn.style.cursor = 'not-allowed';
      notifyBtn.title = 'Cannot notify patients who are called or in consultation';
    } else {
      notifyBtn.style.cursor = 'pointer';
      notifyBtn.title = hasSelection ? 'Notify selected patients' : 'Select patients to notify';
    }
  }
  
  if (reassignBtn) {
    // Disable if no selection, no permission, or selected patients are called/in consultation
    const shouldDisable = !hasSelection || !canManage || hasCalledOrInConsultation;
    reassignBtn.disabled = shouldDisable;
    
    if (!canManage) {
      reassignBtn.style.cursor = 'not-allowed';
      reassignBtn.title = 'Only admins and primary staff can reassign patients';
    } else if (hasCalledOrInConsultation) {
      reassignBtn.style.cursor = 'not-allowed';
      reassignBtn.title = 'Cannot reassign patients who are called or in consultation';
    } else {
      reassignBtn.style.cursor = 'pointer';
      reassignBtn.title = hasSelection ? 'Reassign selected patients' : 'Select patients to reassign';
    }
  }
  
  if (noShowBtn) {
    // Disable if no selection, no permission, or selected patients are called/in consultation
    const shouldDisable = !hasSelection || !canManage || hasCalledOrInConsultation;
    noShowBtn.disabled = shouldDisable;
    
    if (!canManage) {
      noShowBtn.style.cursor = 'not-allowed';
      noShowBtn.title = 'Only admins and primary staff can mark patients as no-show';
    } else if (hasCalledOrInConsultation) {
      noShowBtn.style.cursor = 'not-allowed';
      noShowBtn.title = 'Cannot mark patients as no-show if they are called or in consultation';
    } else {
      noShowBtn.style.cursor = 'pointer';
      noShowBtn.title = hasSelection ? 'Mark selected patients as no-show' : 'Select patients to mark as no-show';
    }
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
  if (!entry) {
    toast.error('Queue entry not found');
    return;
  }

  // Use actual entry status instead of passed currentStatus to ensure accuracy
  const actualStatus = entry.status || currentStatus;

  // Determine next status
  let nextStatus;
  if (actualStatus === 'WAITING') {
    nextStatus = 'TRIAGE';
  } else if (actualStatus === 'TRIAGE') {
    nextStatus = 'CALLED';
  } else if (actualStatus === 'CALLED') {
    // Show room modal for IN_CONSULTATION
    await openRoomModal(entryId);
    return;
  } else if (actualStatus === 'IN_CONSULTATION') {
    // Complete the consultation
    nextStatus = 'COMPLETED';
  } else {
    toast.info('Invalid status transition');
    return;
  }

  await updateQueueStatus(entryId, nextStatus, roomId, buttonEl);
}

/**
 * Update queue entry status with retry logic
 */
async function updateQueueStatus(entryId, status, roomId = null, buttonEl = null, retryCount = 0) {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1000; // 1 second

  try {
    // Disable button during API call and show loading state
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.style.opacity = '0.6';
      buttonEl.style.cursor = 'not-allowed';
      const icon = buttonEl.querySelector('.material-symbols-outlined');
      if (icon && retryCount === 0) {
        icon.style.opacity = '0.5';
      }
    }

    const body = { status };
    if (roomId) {
      body.roomId = roomId;
    }

    const response = await apiPatch(`/queue/${entryId}/status`, body);
    const result = await response.json();

    if (result.success) {
      toast.success(`Status updated to ${formatStatus(status)}`);
      await fetchQueue(false); // Don't show spinner on manual updates
      
      // Update doctor load badge after status change (force refresh)
      if (isDoctor) {
        await fetchDoctorLoad(true);
      }
    } else {
      // Retry on failure if retries remaining
      if (retryCount < MAX_RETRIES && response.status >= 500) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
        return updateQueueStatus(entryId, status, roomId, buttonEl, retryCount + 1);
      }
      toast.error(result.message || 'Failed to update status');
    }
  } catch (error) {
    console.error('Error updating status:', error);
    // Retry on network errors
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
      return updateQueueStatus(entryId, status, roomId, buttonEl, retryCount + 1);
    }
    toast.error('Failed to update status');
  } finally {
    // Re-enable button after API call
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.style.opacity = '1';
      buttonEl.style.cursor = 'pointer';
      const icon = buttonEl.querySelector('.material-symbols-outlined');
      if (icon) {
        icon.style.opacity = '1';
      }
    }
  }
}

/**
 * Open room modal
 */
async function openRoomModal(entryId) {
  currentQueueEntryId = entryId;
  
  // Re-query room modal in case it wasn't found during initialization
  if (!roomModalOverlay) {
    roomModalOverlay = document.getElementById('room-modal-overlay');
    roomList = document.getElementById('room-list');
    roomModalConfirm = document.getElementById('room-modal-confirm');
    roomModalCancel = document.getElementById('room-modal-cancel');
    roomModalClose = document.getElementById('room-modal-close');
  }
  
  const entry = queueData.find(e => e.id === entryId);
  if (!entry) {
    toast.error('Queue entry not found');
    return;
  }

  // Check for department ID in multiple possible locations
  let departmentId = null;
  if (entry.department && entry.department.id) {
    departmentId = entry.department.id;
  } else if (entry.departmentId) {
    departmentId = entry.departmentId;
  }

  if (!departmentId) {
    console.error('Department ID not found in entry:', entry);
    toast.error('Department info unavailable');
    return;
  }

  console.log(`Using department ID: ${departmentId}`);

  // Show loading state
  if (roomList) {
    roomList.innerHTML = '<div class="loading-message">Loading rooms...</div>';
  }

  // Fetch available rooms for the department
  await fetchRooms(departmentId);

  // Ensure modal is visible
  if (roomModalOverlay) {
    // Check if modal card exists
    const modalCard = roomModalOverlay.querySelector('.modal-card');
    if (!modalCard) {
      toast.error('Room modal error. Please refresh');
      return;
    }
    
    // Force show the modal - use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      roomModalOverlay.style.display = 'flex';
      roomModalOverlay.style.zIndex = '10000';
      
      // Small delay to ensure display is set before adding active class
      setTimeout(() => {
    roomModalOverlay.classList.add('active');
      }, 10);
      
      // Ensure modal card is visible and clickable
      modalCard.style.position = 'relative';
      modalCard.style.zIndex = '10001';
      modalCard.style.display = 'block';
      modalCard.style.visibility = 'visible';
      modalCard.style.opacity = '1';
      modalCard.style.pointerEvents = 'auto';
      
      // Ensure buttons are clickable
      const buttons = modalCard.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.style.pointerEvents = 'auto';
        btn.style.zIndex = '10002';
        btn.style.position = 'relative';
      });
    });
  } else {
    toast.error('Room selection modal not available');
  }
}

/**
 * Fetch available rooms
 */
async function fetchRooms(departmentId) {
  try {
    // Fetch rooms for the specific department
    const response = await apiGet(`/rooms?departmentId=${departmentId}&includeInactive=false`);
    const result = await response.json();

    if (result.success && result.data) {
      availableRooms = result.data.rooms || [];
      
      // If no rooms found, try including inactive rooms
      if (availableRooms.length === 0) {
        const inactiveResponse = await apiGet(`/rooms?departmentId=${departmentId}&includeInactive=true`);
        const inactiveResult = await inactiveResponse.json();
        
        if (inactiveResult.success && inactiveResult.data) {
          availableRooms = inactiveResult.data.rooms || [];
          
          if (availableRooms.length > 0) {
            toast.warning('Only inactive rooms available. Activate in Settings');
          }
        }
      }
      
      await renderRoomList();
    } else {
      availableRooms = [];
      await renderRoomList();
      if (result.message) {
        toast.error(result.message);
      } else {
        toast.error('No rooms found. Create in Settings');
      }
    }
  } catch (error) {
    availableRooms = [];
    await renderRoomList();
    toast.error('Failed to load rooms. Please try again.');
  }
}

/**
 * Render room list
 */
async function renderRoomList() {
  if (!roomList) {
    return;
  }

  if (availableRooms.length === 0) {
    roomList.innerHTML = '<div class="loading-message">No rooms available</div>';
    if (roomModalConfirm) {
      roomModalConfirm.disabled = true;
    }
    return;
  }

  // Fetch all occupied rooms (queue entries with IN_CONSULTATION status)
  // This ensures we check all entries, not just the current page
  let occupiedRoomIds = new Set();
  try {
    const occupiedResponse = await apiGet('/staff/queue?status=IN_CONSULTATION&limit=1000');
    const occupiedResult = await occupiedResponse.json();
    
    if (occupiedResult.success && occupiedResult.data?.queueEntries) {
      occupiedRoomIds = new Set(
        occupiedResult.data.queueEntries
          .filter(entry => 
            entry.assignedRoom && 
            entry.assignedRoom.id
          )
          .map(entry => entry.assignedRoom.id)
      );
    }
  } catch (error) {
    // If API call fails, fall back to checking current page data
    occupiedRoomIds = new Set(
      queueData
        .filter(entry => 
          entry.assignedRoom && 
          entry.assignedRoom.id && 
          entry.status === 'IN_CONSULTATION'
        )
        .map(entry => entry.assignedRoom.id)
    );
  }

  // Filter out occupied rooms
  const availableRoomsFiltered = availableRooms.filter(room => !occupiedRoomIds.has(room.id));

  if (availableRoomsFiltered.length === 0) {
    roomList.innerHTML = '<div class="loading-message">No available rooms. All rooms are currently occupied.</div>';
    if (roomModalConfirm) {
      roomModalConfirm.disabled = true;
    }
    return;
  }

  const roomsHTML = availableRoomsFiltered.map(room => `
    <div class="room-item" data-room-id="${room.id}">
      <div class="room-item-name">${room.name}</div>
    </div>
  `).join('');

  roomList.innerHTML = roomsHTML;

  // Attach room selection listeners
  const roomItems = roomList.querySelectorAll('.room-item');
  
  roomItems.forEach(item => {
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

  try {
  const roomId = selectedRoom.dataset.roomId;
    const entryId = currentQueueEntryId;
    
    // Close modal first to avoid UI issues
  closeRoomModal();
  
    // Update status with room assignment
    await updateQueueStatus(entryId, 'IN_CONSULTATION', roomId);
    
    // Force refresh queue to ensure button appears for IN_CONSULTATION status
    await fetchQueue(false);
  } catch (error) {
    console.error('Error assigning room:', error);
    toast.error('Failed to assign room');
  } finally {
  // Re-enable button
  if (roomModalConfirm) {
    roomModalConfirm.disabled = false;
    roomModalConfirm.textContent = 'Assign Room';
    }
  }
}

/**
 * Close room modal
 */
function closeRoomModal() {
  if (roomModalOverlay) {
    roomModalOverlay.classList.remove('active');
    roomModalOverlay.style.display = 'none';
  }
  currentQueueEntryId = null;
  if (roomList) {
    roomList.innerHTML = '';
  }
  if (roomModalConfirm) {
    roomModalConfirm.disabled = true;
    roomModalConfirm.textContent = 'Assign Room';
  }
}

/**
 * Handle notify
 */
async function handleNotify() {
  if (selectedQueueEntries.size === 0) {
    toast.info('Please select patients to notify');
    return;
  }

  if (!isAdmin && !isPrimary) {
    toast.error('Only admins can notify patients');
    return;
  }

  // Check if any selected entries are CALLED or IN_CONSULTATION
  const invalidEntries = Array.from(selectedQueueEntries).filter(entryId => {
    const entry = queueData.find(e => e.id === entryId);
    return entry && (entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION');
  });

  if (invalidEntries.length > 0) {
    toast.error('Cannot notify patients in active consultation');
    return;
  }

  // Open message modal for bulk notification
  openBulkNotifyModal();
}

/**
 * Handle reassign
 */
async function handleReassign() {
  if (selectedQueueEntries.size === 0) {
    toast.info('Please select patients to reassign');
    return;
  }

  if (!isAdmin && !isPrimary) {
    toast.error('Only admins can reassign patients');
    return;
  }

  // Check if any selected entries are CALLED or IN_CONSULTATION
  const invalidEntries = Array.from(selectedQueueEntries).filter(entryId => {
    const entry = queueData.find(e => e.id === entryId);
    return entry && (entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION');
  });

  if (invalidEntries.length > 0) {
    toast.error('Cannot reassign patients in active consultation');
    return;
  }

  // Open doctor selection modal for reassignment
  openReassignModal();
}

/**
 * Handle no-show
 */
async function handleNoShow() {
  if (selectedQueueEntries.size === 0) {
    toast.info('Please select patients to mark as no-show');
    return;
  }

  if (!isAdmin && !isPrimary) {
    toast.error('Only admins can mark as no-show');
    return;
  }

  // Check if any selected entries are CALLED or IN_CONSULTATION
  const invalidEntries = Array.from(selectedQueueEntries).filter(entryId => {
    const entry = queueData.find(e => e.id === entryId);
    return entry && (entry.status === 'CALLED' || entry.status === 'IN_CONSULTATION');
  });

  if (invalidEntries.length > 0) {
    toast.error('Cannot mark active patients as no-show');
    return;
  }

  const confirmed = await showConfirmModal({
    title: 'Mark as No-Show',
    message: `Are you sure you want to mark ${selectedQueueEntries.size} patient(s) as no-show? This action cannot be undone.`,
    confirmText: 'Yes, Mark as No-Show',
    cancelText: 'Cancel',
    confirmColor: 'red',
  });

  if (!confirmed) return;

  try {
    const response = await apiPatch('/queue/bulk-status', {
      queueEntryIds: Array.from(selectedQueueEntries),
      status: 'NO_SHOW',
    });

    const result = await response.json();

    if (result.success) {
      toast.success(result.message || `Marked ${result.data?.updatedCount || selectedQueueEntries.size} patient(s) as no-show`);
      selectedQueueEntries.clear();
      await fetchQueue(false);
    } else {
      toast.error(result.message || 'Failed to mark patients as no-show');
    }
  } catch (error) {
    console.error('Error marking as no-show:', error);
    toast.error('Failed to mark patients as no-show');
  }
}

/**
 * Handle call (individual)
 */
window.handleCall = async function(entryId) {
  const entry = queueData.find(e => e.id === entryId);
  if (!entry) {
    toast.error('Queue entry not found');
    return;
  }

  // Find button element for loading state
  const buttonEl = document.querySelector(`.call-btn[data-entry-id="${entryId}"]`);

  // Transition to CALLED status
  if (entry.status === 'WAITING' || entry.status === 'TRIAGE') {
    await updateQueueStatus(entryId, 'CALLED', null, buttonEl);
  } else {
    toast.info(`Patient is already ${formatStatus(entry.status)}`);
  }
};

/**
 * Handle email (individual)
 */
window.handleEmail = function(entryId) {
  const entry = queueData.find(e => e.id === entryId);
  if (!entry) {
    toast.error('Queue entry not found');
    return;
  }

  if (!entry.patient?.email) {
    toast.error('Patient email not found');
    return;
  }

  // Show loading state on email button
  const buttonEl = document.querySelector(`.email-btn[data-entry-id="${entryId}"]`);
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.style.opacity = '0.6';
  }

  // Open email modal
  openEmailModal(entryId, entry.patient.fullName || 'Patient');
  
  // Re-enable button after modal opens (modal handles its own loading)
  if (buttonEl) {
    setTimeout(() => {
      buttonEl.disabled = false;
      buttonEl.style.opacity = '1';
    }, 100);
  }
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
  const queueContent = document.querySelector('.queue-content');
  
  if (queueContent) {
    queueContent.classList.add('sidebar-visible');
  }

  // Get wait time from cache or entry
  const cachedWaitTime = waitTimeCache.get(entryId);
  const estimatedWaitMinutes = cachedWaitTime?.estimatedWaitMinutes ?? entry.estimatedWaitMinutes ?? null;
  const minWaitMinutes = cachedWaitTime?.minWaitMinutes ?? entry.minWaitMinutes ?? null;
  const maxWaitMinutes = cachedWaitTime?.maxWaitMinutes ?? entry.maxWaitMinutes ?? null;
  
  // Don't show wait time if status is COMPLETED
  const isCompleted = entry.status === 'COMPLETED';
  
  let waitTimeSection = '';
  if (!isCompleted) {
    // For non-completed entries, fetch wait time if not available
    let waitTimeDisplay = 'Estimated Wait: Calculating...';
    if (estimatedWaitMinutes !== null) {
      if (minWaitMinutes !== null && maxWaitMinutes !== null && minWaitMinutes !== maxWaitMinutes) {
        waitTimeDisplay = `Estimated Wait: ${minWaitMinutes}-${maxWaitMinutes} mins`;
      } else {
        waitTimeDisplay = `Estimated Wait: ${Math.round(estimatedWaitMinutes)} mins`;
      }
    }
    
    waitTimeSection = `
    <div class="patient-details-section">
      <div class="patient-details-section-title">Wait Time</div>
      <div class="patient-details-section-content wait-time-display">
        ${waitTimeDisplay}
      </div>
    </div>`;
  }

  patientDetailsCard.innerHTML = `
    <div class="patient-details-header">
      <div class="patient-details-avatar">${patientInitials}</div>
      <div class="patient-details-name">${patientName}</div>
      <div class="patient-details-info">${patient.age || 'N/A'}/${patient.gender || 'N/A'}</div>
    </div>
    ${waitTimeSection}
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

  // Fetch wait time if not completed
  // Always fetch if not available or cache is stale (older than 1 minute) to ensure fresh data
  if (!isCompleted) {
    // If we don't have wait time data, fetch it immediately
    if (estimatedWaitMinutes === null || !cachedWaitTime || (cachedWaitTime.lastUpdated && 
        (Date.now() - new Date(cachedWaitTime.lastUpdated).getTime()) > 60000)) {
      // Fetch wait time asynchronously
      apiGet(`/queue/${entryId}/wait-time`)
        .then(response => response.json())
        .then(result => {
          if (result.success && result.data) {
            waitTimeCache.set(entryId, {
              estimatedWaitMinutes: result.data.estimatedWaitMinutes,
              minWaitMinutes: result.data.minWaitMinutes,
              maxWaitMinutes: result.data.maxWaitMinutes,
              lastUpdated: new Date().toISOString(),
            });
            // Update the sidebar display
            updateSidebarWaitTime(entryId, result.data.estimatedWaitMinutes, result.data.minWaitMinutes, result.data.maxWaitMinutes);
          }
        })
        .catch(error => {
          console.debug(`Failed to fetch wait time for entry ${entryId}:`, error);
        });
    }
  }
}

/**
 * Hide patient details
 */
function hidePatientDetails() {
  const queueContent = document.querySelector('.queue-content');
  
  if (queueContent) {
    queueContent.classList.remove('sidebar-visible');
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
 * Setup status filter with scoped listeners
 */
function setupStatusFilter() {
  // Re-query to ensure elements exist
  const statusBtnEl = document.getElementById('queue-status-btn');
  const statusPanelEl = document.getElementById('queue-status-panel');
  
  if (!statusBtnEl || !statusPanelEl) return;

  // Update global references
  queueStatusBtn = statusBtnEl;
  queueStatusPanel = statusPanelEl;

  // Toggle panel visibility
  cleanupFunctions.push(
    addButtonListener(statusBtnEl, PAGE_ID, (e) => {
    e.stopPropagation();
      statusPanelEl.classList.toggle('visible');
    })
  );

  // Close panel when clicking outside - using scoped document listener
  cleanupFunctions.push(
    addScopedDocumentListener(PAGE_ID, (e) => {
      if (!statusPanelEl.contains(e.target) && !statusBtnEl.contains(e.target)) {
        statusPanelEl.classList.remove('visible');
      }
    })
  );

  // Status change handler
  document.querySelectorAll('input[name="queue-status"]').forEach(radio => {
    cleanupFunctions.push(
      addListener(PAGE_ID, radio, 'change', () => {
        statusPanelEl.classList.remove('visible');
      currentPage = 1;
      fetchQueue();
      })
    );
  });
}

/**
 * Setup date range filter with scoped listeners
 */
function setupDateRangeFilter() {
  // Re-query to ensure elements exist
  const dateRangeBtnEl = document.getElementById('queue-date-range-btn');
  const dateRangePanelEl = document.getElementById('queue-date-range-panel');
  const startDateInputEl = document.getElementById('queue-start-date-input');
  const endDateInputEl = document.getElementById('queue-end-date-input');
  const applyDateBtnEl = document.getElementById('queue-apply-date-btn');
  const clearDateBtnEl = document.getElementById('queue-clear-date-btn');
  
  if (!dateRangeBtnEl || !dateRangePanelEl) return;

  // Update global references
  queueDateRangeBtn = dateRangeBtnEl;
  queueDateRangePanel = dateRangePanelEl;
  queueStartDateInput = startDateInputEl;
  queueEndDateInput = endDateInputEl;
  queueApplyDateBtn = applyDateBtnEl;
  queueClearDateBtn = clearDateBtnEl;

  // Toggle panel visibility
  cleanupFunctions.push(
    addButtonListener(dateRangeBtnEl, PAGE_ID, (e) => {
    e.stopPropagation();
      dateRangePanelEl.classList.toggle('visible');
    })
  );

  // Close panel when clicking outside - using scoped document listener
  cleanupFunctions.push(
    addScopedDocumentListener(PAGE_ID, (e) => {
      if (!dateRangePanelEl.contains(e.target) && !dateRangeBtnEl.contains(e.target)) {
        dateRangePanelEl.classList.remove('visible');
      }
    })
  );

  // Apply date filter
  if (applyDateBtnEl) {
    cleanupFunctions.push(
      addButtonListener(applyDateBtnEl, PAGE_ID, () => {
        dateRangePanelEl.classList.remove('visible');
        const startDate = startDateInputEl?.value || '';
        const endDate = endDateInputEl?.value || '';
        
        if (startDate || endDate) {
          // Apply filters (you'll need to implement this based on your filter logic)
      currentPage = 1;
      fetchQueue();
        }
      })
    );
  }

  // Clear date filter
  if (clearDateBtnEl) {
    cleanupFunctions.push(
      addButtonListener(clearDateBtnEl, PAGE_ID, () => {
        if (startDateInputEl) startDateInputEl.value = '';
        if (endDateInputEl) endDateInputEl.value = '';
        dateRangePanelEl.classList.remove('visible');
      currentPage = 1;
      fetchQueue();
      })
    );
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

// Cache for doctor load to reduce API calls
let doctorLoadCache = {
  data: null,
  timestamp: null,
  CACHE_DURATION: 5000 // 5 seconds
};

/**
 * Fetch doctor load information (with caching)
 */
async function fetchDoctorLoad(forceRefresh = false) {
  if (!isDoctor || !doctorLoadBadge) return;

  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh && doctorLoadCache.data && doctorLoadCache.timestamp) {
      const cacheAge = Date.now() - doctorLoadCache.timestamp;
      if (cacheAge < doctorLoadCache.CACHE_DURATION) {
        const { current, max } = doctorLoadCache.data;
        doctorLoadBadge.textContent = `Active Patients: ${current} / ${max}`;
        doctorLoadBadge.classList.remove('hidden');
        return;
      }
    }

    // Get doctor load from user object (from auth middleware)
    if (user && user.currentActivePatients !== undefined && user.maxConcurrentPatients !== undefined) {
      const current = user.currentActivePatients || 0;
      const max = user.maxConcurrentPatients || 3;
      
      // Update cache
      doctorLoadCache.data = { current, max };
      doctorLoadCache.timestamp = Date.now();
      
      doctorLoadBadge.textContent = `Active Patients: ${current} / ${max}`;
      doctorLoadBadge.classList.remove('hidden');
    } else {
      // Fallback: fetch from API if user object doesn't have load info
      const response = await apiGet('/staff/dashboard');
      const result = await response.json();
      
      if (result.success && result.data && result.data.user) {
        const current = result.data.user.currentActivePatients || 0;
        const max = result.data.user.maxConcurrentPatients || 3;
        
        // Update cache
        doctorLoadCache.data = { current, max };
        doctorLoadCache.timestamp = Date.now();
        
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
    // Use cached data if available
    if (doctorLoadCache.data) {
      const { current, max } = doctorLoadCache.data;
      doctorLoadBadge.textContent = `Active Patients: ${current} / ${max}`;
      doctorLoadBadge.classList.remove('hidden');
    }
  }
}

/**
 * Start polling
 * Optimized with Page Visibility API to pause when tab is hidden
 */
function startPolling() {
  // Clear existing intervals
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  if (waitTimePollingInterval) {
    clearInterval(waitTimePollingInterval);
  }

  // Poll queue data every 30 seconds (without showing spinner)
  // Only poll when page is visible
  pollingInterval = setInterval(() => {
    if (!document.hidden) {
      fetchQueue(false); // Don't show spinner during automatic polling
    }
  }, 30000);

  // Use SSE for real-time wait time updates (preferred) or fallback to polling
  startWaitTimeSSE();
  
  // Fallback polling every 30 seconds if SSE is not available
  // Only poll when page is visible
  waitTimePollingInterval = setInterval(() => {
    if (!document.hidden) {
      updateWaitTimes(); // Update wait times without full refresh
    }
  }, 30000);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (waitTimePollingInterval) {
    clearInterval(waitTimePollingInterval);
    waitTimePollingInterval = null;
  }
  // Close all SSE connections
  stopWaitTimeSSE();
}

/**
 * Start SSE connections for real-time wait time updates
 * Connects to SSE endpoint for each active queue entry
 */
function startWaitTimeSSE() {
  // Close existing connections
  stopWaitTimeSSE();

  // Get active queue entries
  const activeEntries = queueData.filter(entry =>
    ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'].includes(entry.status)
  );

  activeEntries.forEach(entry => {
    try {
      // Create SSE connection
      const eventSource = new EventSource(`/api/queue/${entry.id}/wait-time/stream`);

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'update' && message.data) {
            const { estimatedWaitMinutes, minWaitMinutes, maxWaitMinutes } = message.data;
            
            // Update cache
            waitTimeCache.set(entry.id, {
              estimatedWaitMinutes,
              minWaitMinutes,
              maxWaitMinutes,
              lastUpdated: new Date().toISOString(),
            });

            // Update entry in queueData
            entry.estimatedWaitMinutes = estimatedWaitMinutes;
            entry.minWaitMinutes = minWaitMinutes;
            entry.maxWaitMinutes = maxWaitMinutes;
            
            // Update sidebar if this entry is selected
            if (selectedQueueEntries.has(entry.id)) {
              updateSidebarWaitTime(entry.id, estimatedWaitMinutes, minWaitMinutes, maxWaitMinutes);
            }
          } else if (message.type === 'error') {
            console.error(`SSE error for entry ${entry.id}:`, message.message);
          }
        } catch (error) {
          console.error(`Error parsing SSE message for entry ${entry.id}:`, error);
        }
      };

      eventSource.onerror = (error) => {
        console.error(`SSE connection error for entry ${entry.id}:`, error);
        // Close and remove from map
        eventSource.close();
        waitTimeSSEConnections.delete(entry.id);
      };

      waitTimeSSEConnections.set(entry.id, eventSource);
    } catch (error) {
      console.error(`Failed to create SSE connection for entry ${entry.id}:`, error);
    }
  });
}

/**
 * Stop all SSE connections
 */
function stopWaitTimeSSE() {
  waitTimeSSEConnections.forEach((eventSource, entryId) => {
    try {
      eventSource.close();
    } catch (error) {
      console.error(`Error closing SSE connection for entry ${entryId}:`, error);
    }
  });
  waitTimeSSEConnections.clear();
}

/**
 * Update wait times for active queue entries
 * Polls wait-time endpoint for entries in WAITING, TRIAGE, CALLED, IN_CONSULTATION status
 * This is a fallback if SSE is not available
 */
async function updateWaitTimes() {
  if (!queueData || queueData.length === 0) return;

  // Filter to only active entries
  const activeEntries = queueData.filter(entry => 
    ['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'].includes(entry.status)
  );

  if (activeEntries.length === 0) return;

  // Poll wait times for all active entries in parallel
  const waitTimePromises = activeEntries.map(async (entry) => {
    try {
      const response = await apiGet(`/queue/${entry.id}/wait-time`);
      const result = await response.json();

      if (result.success && result.data) {
        // Update cache with confidence intervals
        waitTimeCache.set(entry.id, {
          estimatedWaitMinutes: result.data.estimatedWaitMinutes,
          minWaitMinutes: result.data.minWaitMinutes,
          maxWaitMinutes: result.data.maxWaitMinutes,
          lastUpdated: new Date().toISOString(),
        });

        // Update entry in queueData
        entry.estimatedWaitMinutes = result.data.estimatedWaitMinutes;
        entry.minWaitMinutes = result.data.minWaitMinutes;
        entry.maxWaitMinutes = result.data.maxWaitMinutes;
        
        // Update sidebar if this entry is selected
        if (selectedQueueEntries.has(entry.id)) {
          updateSidebarWaitTime(entry.id, result.data.estimatedWaitMinutes, result.data.minWaitMinutes, result.data.maxWaitMinutes);
        }
      }
    } catch (error) {
      // Silently fail for individual entries - don't spam errors
      console.debug(`Failed to fetch wait time for entry ${entry.id}:`, error);
    }
  });

  // Wait for all requests to complete (use Promise.allSettled to not fail on individual errors)
  await Promise.allSettled(waitTimePromises);
  
  // Restart SSE connections if they were closed
  if (waitTimeSSEConnections.size === 0) {
    startWaitTimeSSE();
  }
}

/**
 * Update wait time display in sidebar with confidence intervals
 */
function updateSidebarWaitTime(entryId, estimatedWaitMinutes, minWaitMinutes = null, maxWaitMinutes = null) {
  if (!patientDetailsCard) return;

  // Check if entry is completed - don't update wait time for completed entries
  const entry = queueData.find(e => e.id === entryId);
  if (entry && entry.status === 'COMPLETED') {
    return; // Don't show/update wait time for completed entries
  }

  // Find wait time element in sidebar
  const waitTimeElement = patientDetailsCard.querySelector('.wait-time-display');
  if (waitTimeElement) {
    if (estimatedWaitMinutes !== null && estimatedWaitMinutes !== undefined) {
      if (minWaitMinutes !== null && maxWaitMinutes !== null && minWaitMinutes !== maxWaitMinutes) {
        waitTimeElement.textContent = `Estimated Wait: ${minWaitMinutes}-${maxWaitMinutes} mins`;
      } else {
        waitTimeElement.textContent = `Estimated Wait: ${Math.round(estimatedWaitMinutes)} mins`;
      }
      waitTimeElement.style.display = 'block';
    } else {
      waitTimeElement.textContent = 'Estimated Wait: Calculating...';
    }
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

// Move dropdown functionality removed - use Waiting Area page instead

/**
 * Open reassign modal
 */
async function openReassignModal() {
  // Close any existing modals first
  closeAllModals();
  
  try {
    // Fetch available doctors
    const response = await apiGet('/queue/doctors');
    const result = await response.json();

    if (!result.success || !result.data?.doctors) {
      toast.error('Failed to load doctors');
      return;
    }

    const doctors = result.data.doctors;

    // Count assigned patients for each doctor (with caching and error recovery)
    const doctorsWithPatientCount = await Promise.all(doctors.map(async (doctor) => {
      let retryCount = 0;
      const MAX_RETRIES = 2;
      
      while (retryCount <= MAX_RETRIES) {
        try {
          const queueResponse = await apiGet(`/staff/queue?assignedDoctorId=${doctor.id}&limit=1000`);
          const queueResult = await queueResponse.json();
          const assignedCount = queueResult.success && queueResult.data?.queueEntries 
            ? queueResult.data.queueEntries.filter(e => 
                e.status !== 'COMPLETED' && 
                e.status !== 'CANCELLED' && 
                e.status !== 'NO_SHOW'
              ).length 
            : 0;
          return { ...doctor, assignedPatientCount: assignedCount };
        } catch (error) {
          retryCount++;
          if (retryCount > MAX_RETRIES) {
            console.error(`Error counting patients for doctor ${doctor.id} after ${MAX_RETRIES} retries:`, error);
            // Use currentActivePatients as fallback if available
            const fallbackCount = doctor.currentActivePatients !== undefined 
              ? doctor.currentActivePatients 
              : 0;
            return { ...doctor, assignedPatientCount: fallbackCount };
          }
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
        }
      }
    }));

    // Filter to only show doctors that have patients assigned
    const doctorsWithPatients = doctorsWithPatientCount.filter(doctor => 
      (doctor.assignedPatientCount || 0) > 0
    );

    if (doctorsWithPatients.length === 0) {
      toast.error('No doctors with assigned patients available');
      return;
    }

    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container';
    modalContainer.style.cssText = 'max-width: 36rem; width: 90%; max-height: 80vh; overflow-y: auto;';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'padding: 1.5rem; text-align: left; align-items: flex-start;';

    modalContent.innerHTML = `
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.8rem; border-bottom: 1px solid #e0e0e0; width: 100%;">
        <h2 style="font-size: 1.2rem; font-weight: 600; margin: 0;">Reassign Patients</h2>
        <button class="modal-close" style="background: none; border: none; cursor: pointer; font-size: 1.8rem; color: #666;">&times;</button>
      </div>
      <div class="modal-body" style="width: 100%;">
        <p style="font-size: 1rem; color: #666; margin-bottom: 1rem;">Select a doctor to reassign ${selectedQueueEntries.size} patient(s) to:</p>
        <select id="reassign-doctor-select" style="width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #e0e0e0; border-radius: 0.4rem; font-size: 1rem; margin-bottom: 1rem;">
          <option value="">-- Select Doctor --</option>
          ${doctorsWithPatients.map(doctor => {
            const assignedCount = doctor.assignedPatientCount || 0;
            const maxCapacity = doctor.maxConcurrentPatients || 3;
            const loadDisplay = `${assignedCount}/${maxCapacity}`;
            return `
            <option value="${doctor.id}">
              Dr. ${doctor.firstName} ${doctor.lastName} 
              (${doctor.department?.name || 'N/A'}) 
              - ${loadDisplay}
              ${!doctor.isAvailable ? ' [Unavailable]' : ''}
            </option>
          `;
          }).join('')}
        </select>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.8rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; width: 100%;">
        <button class="btn btn-secondary" id="reassign-modal-cancel" style="padding: 0.6rem 1.2rem; border: none; border-radius: 0.4rem; font-size: 1rem; cursor: pointer; background: #f5f5f5; color: #333;">Cancel</button>
        <button class="btn btn-primary" id="reassign-modal-confirm" disabled style="padding: 0.6rem 1.2rem; border: none; border-radius: 0.4rem; font-size: 1rem; cursor: pointer; background: #0e3995; color: white;">Reassign</button>
      </div>
    `;

    modalContainer.appendChild(modalContent);
    overlay.appendChild(modalContainer);
    document.body.appendChild(overlay);

    // Trigger animation by adding modal-show class after a brief delay
    setTimeout(() => {
      overlay.classList.add('modal-show');
    }, 10);

    const selectEl = modalContent.querySelector('#reassign-doctor-select');
    const confirmBtn = modalContent.querySelector('#reassign-modal-confirm');
    const cancelBtn = modalContent.querySelector('#reassign-modal-cancel');
    const closeBtn = modalContent.querySelector('.modal-close');

    // Enable/disable confirm button based on selection
    selectEl.addEventListener('change', () => {
      confirmBtn.disabled = !selectEl.value;
    });

    // Close handlers
    const closeModal = () => {
      overlay.classList.remove('modal-show');
      overlay.classList.add('modal-hide');
      setTimeout(() => {
        if (overlay.parentNode) {
          document.body.removeChild(overlay);
        }
      }, 300);
    };

    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Confirm handler
    confirmBtn.addEventListener('click', async () => {
      const doctorId = selectEl.value;
      if (!doctorId) return;

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Reassigning...';

      try {
        const response = await apiPatch('/queue/reassign', {
          queueEntryIds: Array.from(selectedQueueEntries),
          newDoctorId: doctorId,
        });

        const result = await response.json();

        if (result.success) {
          toast.success(result.message || `Reassigned ${result.data?.updatedCount || selectedQueueEntries.size} patient(s)`);
          selectedQueueEntries.clear();
          closeModal();
          // Invalidate doctor load cache after reassignment
          doctorLoadCache.data = null;
          doctorLoadCache.timestamp = null;
          await fetchQueue(false);
        } else {
          toast.error(result.message || 'Failed to reassign patients');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Reassign';
        }
      } catch (error) {
        console.error('Error reassigning:', error);
        toast.error('Failed to reassign patients');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Reassign';
      }
    });
  } catch (error) {
    console.error('Error opening reassign modal:', error);
    toast.error('Failed to open reassign modal');
  }
}

/**
 * Open email modal (individual)
 */
function openEmailModal(entryId, patientName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-container';
  modalContainer.style.cssText = 'max-width: 40rem; width: 90%; max-height: 90vh; overflow-y: auto;';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.cssText = 'padding: 1.2rem; text-align: left; align-items: flex-start;';

  modalContent.innerHTML = `
    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.8rem; border-bottom: 1px solid #e0e0e0; width: 100%;">
      <h2 style="font-size: 1.2rem; font-weight: 600; margin: 0;">Send Email to ${patientName}</h2>
      <button class="modal-close" style="background: none; border: none; cursor: pointer; font-size: 1.8rem; color: #666;">&times;</button>
    </div>
    <div class="modal-body" style="padding: 0.8rem 0; width: 100%;">
      <label style="display: block; font-size: 1rem; font-weight: 500; margin-bottom: 0.6rem; color: #333;">Message</label>
      <textarea id="email-message-input" style="width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #e0e0e0; border-radius: 0.4rem; font-size: 1rem; min-height: 10rem; font-family: inherit; resize: vertical;" placeholder="Enter your message..."></textarea>
    </div>
    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.8rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; width: 100%;">
      <button class="btn btn-secondary" id="email-modal-cancel" style="padding: 0.6rem 1.2rem; border: none; border-radius: 0.4rem; font-size: 1rem; cursor: pointer; background: #f5f5f5; color: #333;">Cancel</button>
      <button class="btn btn-primary" id="email-modal-confirm" style="padding: 0.6rem 1.2rem; border: none; border-radius: 0.4rem; font-size: 1rem; cursor: pointer; background: #0e3995; color: white;">Send Email</button>
    </div>
  `;

  modalContainer.appendChild(modalContent);
  overlay.appendChild(modalContainer);
  document.body.appendChild(overlay);

  // Trigger animation by adding modal-show class after a brief delay
  setTimeout(() => {
    overlay.classList.add('modal-show');
  }, 10);

  const messageInput = modalContent.querySelector('#email-message-input');
  const confirmBtn = modalContent.querySelector('#email-modal-confirm');
  const cancelBtn = modalContent.querySelector('#email-modal-cancel');
  const closeBtn = modalContent.querySelector('.modal-close');

  // Close handlers
  const closeModal = () => {
    overlay.classList.remove('modal-show');
    overlay.classList.add('modal-hide');
    setTimeout(() => {
      if (overlay.parentNode) {
        document.body.removeChild(overlay);
      }
    }, 300);
  };

  cancelBtn.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Confirm handler with retry logic
  confirmBtn.addEventListener('click', async () => {
    const message = messageInput.value.trim();
    if (!message) {
      toast.error('Please enter a message');
      return;
    }

    let retryCount = 0;
    const MAX_RETRIES = 2;
    const sendEmail = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = retryCount > 0 ? `Retrying... (${retryCount}/${MAX_RETRIES})` : 'Sending...';

      try {
        const response = await apiPost(`/queue/${entryId}/email`, { message });
        const result = await response.json();

        if (result.success) {
          toast.success('Email sent successfully');
          closeModal();
        } else {
          // Retry on server errors
          if (retryCount < MAX_RETRIES && response.status >= 500) {
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            return sendEmail();
          }
          toast.error(result.message || 'Failed to send email');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Send Email';
        }
      } catch (error) {
        console.error('Error sending email:', error);
        // Retry on network errors
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          return sendEmail();
        }
        toast.error('Failed to send email');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Send Email';
      }
    };

    await sendEmail();
  });
}

/**
 * Close all open modals (only dynamically created ones, not static HTML modals)
 */
function closeAllModals() {
  // Only close dynamically created modals (those added to body, not static HTML modals)
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => {
    try {
      // Skip static HTML modals (like room-modal-overlay which is part of the page HTML)
      // Only close modals that were dynamically created and added to body
      const isStaticModal = modal.id === 'room-modal-overlay' || 
                           modal.closest('#app-content') !== null;
      
      if (!isStaticModal) {
        // This is a dynamically created modal
        modal.classList.remove('modal-show');
        modal.classList.add('modal-hide');
        setTimeout(() => {
          if (modal.parentNode && modal.parentNode === document.body) {
            modal.parentNode.removeChild(modal);
          }
        }, 100);
      } else {
        // For static modals, just hide them if they're visible
        if (modal.classList.contains('active') || modal.style.display === 'flex') {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
      }
    } catch (error) {
      // Modal might already be removed
    }
  });
  document.body.style.overflow = '';
}

/**
 * Open bulk notify modal
 */
function openBulkNotifyModal() {
  // Close any existing modals first
  closeAllModals();
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container';
    modalContainer.style.cssText = 'max-width: 36rem; width: 90%; max-height: 80vh; overflow-y: auto;';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'padding: 1.5rem; text-align: left; align-items: flex-start;';

    modalContent.innerHTML = `
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.8rem; border-bottom: 1px solid #e0e0e0; width: 100%;">
        <h2 style="font-size: 1.2rem; font-weight: 600; margin: 0;">Notify Patients</h2>
        <button class="modal-close" style="background: none; border: none; cursor: pointer; font-size: 1.8rem; color: #666;">&times;</button>
      </div>
      <div class="modal-body" style="width: 100%;">
        <p style="font-size: 1rem; color: #666; margin-bottom: 1rem;">Send notification to ${selectedQueueEntries.size} selected patient(s):</p>
        <label style="display: block; font-size: 1rem; font-weight: 500; margin-bottom: 0.6rem; color: #333;">Message</label>
        <textarea id="bulk-notify-message-input" style="width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #e0e0e0; border-radius: 0.4rem; font-size: 1rem; min-height: 12rem; font-family: inherit; resize: vertical;" placeholder="Enter your message..."></textarea>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.8rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; width: 100%;">
        <button class="btn btn-secondary" id="bulk-notify-modal-cancel" style="padding: 0.6rem 1.2rem; border: none; border-radius: 0.4rem; font-size: 1rem; cursor: pointer; background: #f5f5f5; color: #333;">Cancel</button>
        <button class="btn btn-primary" id="bulk-notify-modal-confirm" style="padding: 0.6rem 1.2rem; border: none; border-radius: 0.4rem; font-size: 1rem; cursor: pointer; background: #0e3995; color: white;">Send Notifications</button>
      </div>
    `;

  modalContainer.appendChild(modalContent);
  overlay.appendChild(modalContainer);
  document.body.appendChild(overlay);

  // Trigger animation by adding modal-show class after a brief delay
  setTimeout(() => {
    overlay.classList.add('modal-show');
  }, 10);

  const messageInput = modalContent.querySelector('#bulk-notify-message-input');
  const confirmBtn = modalContent.querySelector('#bulk-notify-modal-confirm');
  const cancelBtn = modalContent.querySelector('#bulk-notify-modal-cancel');
  const closeBtn = modalContent.querySelector('.modal-close');

  // Close handlers
  const closeModal = () => {
    overlay.classList.remove('modal-show');
    overlay.classList.add('modal-hide');
    setTimeout(() => {
      if (overlay.parentNode) {
        document.body.removeChild(overlay);
      }
    }, 300);
  };

  cancelBtn.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Confirm handler
  confirmBtn.addEventListener('click', async () => {
    const message = messageInput.value.trim();
    if (!message) {
      toast.error('Please enter a message');
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Sending...';

    try {
      const response = await apiPost('/queue/bulk-notify', {
        queueEntryIds: Array.from(selectedQueueEntries),
        message,
    });

    const result = await response.json();

    if (result.success) {
        toast.success(result.message || `Sent ${result.data?.sentCount || selectedQueueEntries.size} notification(s)`);
        selectedQueueEntries.clear();
        closeModal();
        await fetchQueue(false);
    } else {
        toast.error(result.message || 'Failed to send notifications');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Send Notifications';
    }
  } catch (error) {
      console.error('Error sending notifications:', error);
      toast.error('Failed to send notifications');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Send Notifications';
    }
  });
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

// Store view-loaded handler for cleanup
let viewLoadedHandler = null;
let isInitializing = false; // Prevent multiple simultaneous initializations

// Register event listener immediately when module loads
viewLoadedHandler = async (e) => {
  if (e.detail.route === 'queues') {
    // Prevent multiple simultaneous initializations
    if (isInitializing) {
      console.log('Queue page initialization already in progress, skipping...');
      return;
    }
    
    console.log('view-loaded event received for queues route');
    isInitializing = true;
    
    // Cleanup previous page before initializing (close modals, remove listeners)
    cleanupPage(PAGE_ID);
    closeAllModals();
    stopPolling();
    
    // Wait a bit to ensure DOM is fully ready
    setTimeout(async () => {
      try {
        await initQueuePage();
      } catch (err) {
        console.error('Error initializing queue page:', err);
        toast.error('Failed to initialize queue page');
      } finally {
        isInitializing = false;
      }
    }, 150);
  }
};

window.addEventListener('view-loaded', viewLoadedHandler);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (viewLoadedHandler) {
    window.removeEventListener('view-loaded', viewLoadedHandler);
  }
  cleanupPage(PAGE_ID);
  closeAllModals();
  stopPolling();
});
