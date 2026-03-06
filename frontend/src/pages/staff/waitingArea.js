/**
 * Waiting Area Management Page
 * Handles waiting area display and management
 */

'use strict';

import { apiGet, apiPatch, apiPost } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';

// State
let waitingAreas = [];
let waitingAreasState = [];
let selectedAreaId = null;
let selectedArea = null;
let selectedPatientIds = new Set();
let isMyPatientsView = false; // Toggle between waiting area view and my patients view
let pollingInterval = null; // Auto-refresh polling interval
let currentPage = 1; // Current page for pagination
let totalPatients = 0; // Total patient count for pagination
const PATIENTS_PER_PAGE = 10; // Pagination limit

/**
 * Fetch waiting areas from API
 */
async function fetchWaitingAreas() {
  try {
    const response = await apiGet('/waiting-areas');
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch waiting areas');
    }

    waitingAreas = result.data.waitingAreas || [];
    waitingAreasState = result.data.waitingAreas || [];
    renderWaitingAreas(waitingAreas);
    populateFilters(waitingAreasState);
  } catch (error) {
    console.error('Error fetching waiting areas:', error);
    toast.error(error.message || 'Failed to load waiting areas');
  }
}

/**
 * Render waiting areas in the list container
 * @param {Array} areas - Array of waiting area objects
 */
function renderWaitingAreas(areas) {
  const container = document.getElementById('waiting-area-list');
  
  if (!container) {
    console.error('Waiting area list container not found');
    return;
  }

  // Get current filter values
  const facilityFilter = document.getElementById('facility-filter')?.value || '';
  const floorFilter = document.getElementById('floor-filter')?.value || '';

  // Filter areas based on selected filters
  let filteredAreas = areas || [];
  if (facilityFilter) {
    filteredAreas = filteredAreas.filter(area => area.facility === facilityFilter);
  }
  if (floorFilter) {
    filteredAreas = filteredAreas.filter(area => area.floor === floorFilter);
  }

  // Clear container
  container.innerHTML = '';

  // Handle empty state
  if (!filteredAreas || filteredAreas.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No waiting areas found${facilityFilter || floorFilter ? ' matching filters' : ''}</p>
      </div>
    `;
    return;
  }

  // Render each waiting area card
  filteredAreas.forEach((area) => {
    const card = createWaitingAreaCard(area);
    container.appendChild(card);
  });
}

/**
 * Create a waiting area card element
 * @param {Object} area - Waiting area object
 * @returns {HTMLElement} Card element
 */
function createWaitingAreaCard(area) {
  const card = document.createElement('div');
  card.className = 'area-card';
  card.setAttribute('data-id', area.id);
  
  // Add click handler
  card.addEventListener('click', () => {
    // If in My Patients view, switch back to waiting area view
    if (isMyPatientsView) {
      isMyPatientsView = false;
      updateMyPatientsToggle();
    }

    // Toggle selection: if clicking the same card, unselect it
    if (selectedAreaId === area.id) {
      selectedAreaId = null;
      selectedArea = null;
      selectedPatientIds.clear();
      highlightSelectedCard();
      // Hide sidebar when unselecting
      const sidebar = document.getElementById('waiting-area-details-sidebar');
      if (sidebar) {
        sidebar.style.display = 'none';
      }
      return;
    }

    // Select new area
    selectedAreaId = area.id;
    selectedArea = area;
    selectedPatientIds.clear(); // Clear selections when switching areas
    currentPage = 1; // Reset to first page
    highlightSelectedCard();
    fetchAreaPatients(area.id, 1, true);
  });

  // Safely get values with defaults
  const capacity = area.capacity ?? 0;
  const currentOccupancy = area.currentOccupancy ?? 0;
  const name = area.name || 'Unnamed Area';
  const facility = area.facility || null;
  const floor = area.floor || null;
  const isDefault = area.isDefault === true;

  // Calculate percentage - handle edge cases
  let percentage = 0;
  let percentageText = '0%';
  let isOverCapacity = false;

  if (capacity > 0) {
    percentage = Math.round((currentOccupancy / capacity) * 100);
    if (currentOccupancy > capacity) {
      isOverCapacity = true;
      percentageText = '100%+';
    } else {
      percentageText = `${percentage}%`;
    }
  } else {
    // capacity = 0 edge case
    percentageText = '0%';
  }

  // Determine color class based on occupancy
  let colorClass = 'area-green';
  if (isOverCapacity || percentage >= 90) {
    colorClass = 'area-red';
  } else if (percentage >= 60) {
    colorClass = 'area-yellow';
  }

  card.classList.add(colorClass);

  // Build card HTML
  const defaultBadge = isDefault
    ? '<span class="default-badge">Default</span>'
    : '';

  const facilityText = facility ? `<div class="area-card-detail"><strong>Facility:</strong> ${escapeHtml(facility)}</div>` : '';
  const floorText = floor ? `<div class="area-card-detail"><strong>Floor:</strong> ${escapeHtml(floor)}</div>` : '';

  // Check user permissions for edit/delete
  const user = getAuthUser();
  const isAdmin = user?.role === 'ADMIN';
  const isPrimary = user?.isPrimary === true;
  const canEdit = isAdmin || isPrimary;

  const actionButtons = canEdit ? `
    <div class="area-card-actions">
      <button class="area-edit-btn" data-area-id="${area.id}" title="Edit">
        <span class="material-symbols-outlined">edit</span>
      </button>
      <button class="area-delete-btn" data-area-id="${area.id}" title="Delete">
        <span class="material-symbols-outlined">delete</span>
      </button>
    </div>
  ` : '';

  card.innerHTML = `
    <div class="area-card-header">
      <div class="area-card-name" title="${escapeHtml(name)}">
        ${escapeHtml(name)}
        ${defaultBadge}
      </div>
    </div>
    <div class="area-card-details">
      ${facilityText}
      ${floorText}
      <div class="area-card-footer">
        <div class="area-card-occupancy">
          <div class="area-card-capacity">
            ${currentOccupancy} / ${capacity}
          </div>
          <div class="area-card-percentage">
            ${percentageText} occupied
          </div>
        </div>
        ${actionButtons}
      </div>
    </div>
  `;

  // Add event listeners for edit/delete buttons
  if (canEdit) {
    const editBtn = card.querySelector('.area-edit-btn');
    const deleteBtn = card.querySelector('.area-delete-btn');

    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        handleEditWaitingArea(area);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        handleDeleteWaitingArea(area);
      });
    }
  }

  return card;
}

/**
 * Populate facility and floor filter dropdowns
 * @param {Array} areas - Array of waiting area objects
 */
function populateFilters(areas) {
  const facilitySelect = document.getElementById('facility-filter');
  const floorSelect = document.getElementById('floor-filter');

  if (!facilitySelect || !floorSelect) return;

  // Get unique facilities and floors
  const facilities = new Set();
  const floors = new Set();

  areas.forEach((area) => {
    if (area.facility && area.facility.trim()) {
      facilities.add(area.facility.trim());
    }
    if (area.floor && area.floor.trim()) {
      floors.add(area.floor.trim());
    }
  });

  // Populate facility dropdown
  const currentFacility = facilitySelect.value;
  facilitySelect.innerHTML = '<option value="">Select Facility</option>';
  Array.from(facilities).sort().forEach((facility) => {
    const option = document.createElement('option');
    option.value = facility;
    option.textContent = facility;
    facilitySelect.appendChild(option);
  });
  if (currentFacility) {
    facilitySelect.value = currentFacility;
  }

  // Populate floor dropdown
  const currentFloor = floorSelect.value;
  floorSelect.innerHTML = '<option value="">Select Floor</option>';
  Array.from(floors).sort().forEach((floor) => {
    const option = document.createElement('option');
    option.value = floor;
    option.textContent = floor;
    floorSelect.appendChild(option);
  });
  if (currentFloor) {
    floorSelect.value = currentFloor;
  }
}

/**
 * Highlight the selected card
 */
function highlightSelectedCard() {
  // Remove highlight from all cards
  document.querySelectorAll('.area-card').forEach(card => {
    card.classList.remove('area-card-selected');
  });
  
  // Add highlight to selected card
  if (selectedAreaId) {
    const selectedCard = document.querySelector(`.area-card[data-id="${selectedAreaId}"]`);
    if (selectedCard) {
      selectedCard.classList.add('area-card-selected');
    }
  }
}

/**
 * Fetch patients in a waiting area
 * @param {string} waitingAreaId - Waiting area ID
 * @param {number} page - Page number (default: 1)
 * @param {boolean} showSpinner - Whether to show loading spinner (default: false)
 */
async function fetchAreaPatients(waitingAreaId, page = 1, showSpinner = false) {
  try {
    currentPage = page;
    const response = await apiGet(`/staff/queue?waitingAreaId=${waitingAreaId}&page=${page}&limit=${PATIENTS_PER_PAGE}`);
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch patients');
    }

    const entries = result.data.queueEntries || [];
    totalPatients = result.data.pagination?.totalCount || entries.length;
    renderAreaPatients(entries, result.data.pagination);
  } catch (error) {
    console.error('Error fetching area patients:', error);
    if (showSpinner) {
      toast.error(error.message || 'Failed to load patients');
    }
    // Hide sidebar on error
    const sidebar = document.getElementById('waiting-area-details-sidebar');
    if (sidebar) {
      sidebar.style.display = 'none';
    }
    selectedAreaId = null;
    selectedArea = null;
    highlightSelectedCard(); // Remove highlight
  }
}

/**
 * Fetch all doctor's assigned patients (My Patients view)
 * @param {number} page - Page number (default: 1)
 * @param {boolean} showSpinner - Whether to show loading spinner (default: false)
 */
async function fetchMyPatients(page = 1, showSpinner = false) {
  try {
    currentPage = page;
    // Filter by status to only get moveable patients
    const response = await apiGet(`/staff/queue?status=WAITING,TRIAGE,CALLED&page=${page}&limit=${PATIENTS_PER_PAGE}`);
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch patients');
    }

    const entries = result.data.queueEntries || [];
    totalPatients = result.data.pagination?.totalCount || entries.length;
    renderAreaPatients(entries, result.data.pagination);
  } catch (error) {
    console.error('Error fetching my patients:', error);
    if (showSpinner) {
      toast.error(error.message || 'Failed to load patients');
    }
    // Hide sidebar on error
    const sidebar = document.getElementById('waiting-area-details-sidebar');
    if (sidebar) {
      sidebar.style.display = 'none';
    }
    isMyPatientsView = false;
  }
}

// Store entries for move handler access
let currentPatientEntries = [];

/**
 * Show waiting area details in sidebar
 * @param {Object} area - Waiting area object
 */
function showWaitingAreaDetails(area) {
  const sidebar = document.getElementById('waiting-area-details-sidebar');
  const titleEl = document.getElementById('waiting-area-details-title');
  const occupancyInfoEl = document.getElementById('waiting-area-occupancy-info');
  const occupancyTextEl = document.getElementById('occupancy-text');
  const criticalBadgeEl = document.getElementById('critical-badge');

  if (!sidebar || !titleEl) return;

  // Show sidebar
  sidebar.style.display = 'flex';

  // Update title based on view mode
  if (isMyPatientsView) {
    titleEl.textContent = 'My Patients';
    if (occupancyInfoEl) {
      occupancyInfoEl.style.display = 'none';
    }
  } else {
    titleEl.textContent = area.name || 'Unnamed Area';

    // Update occupancy
    const capacity = area.capacity ?? 0;
    const currentOccupancy = area.currentOccupancy ?? 0;
    const occupancyPercentage = capacity > 0 ? Math.round((currentOccupancy / capacity) * 100) : 0;
    const isCritical = occupancyPercentage >= 90;

    if (occupancyTextEl) {
      occupancyTextEl.textContent = `${currentOccupancy}/${capacity}`;
    }

    if (occupancyInfoEl) {
      occupancyInfoEl.style.display = 'flex';
    }

    if (criticalBadgeEl) {
      if (isCritical) {
        criticalBadgeEl.style.display = 'inline-block';
      } else {
        criticalBadgeEl.style.display = 'none';
      }
    }
  }
}

/**
 * Render patients in the waiting area
 * @param {Array} entries - Array of queue entry objects
 * @param {Object} pagination - Pagination info object
 */
function renderAreaPatients(entries, pagination = null) {
  const container = document.getElementById('waiting-area-patient-list');
  const sidebar = document.getElementById('waiting-area-details-sidebar');
  
  if (!container) {
    console.error('Patient list container not found');
    return;
  }

  // Store entries globally for move handler
  currentPatientEntries = entries || [];

  // Clear container
  container.innerHTML = '';

  // Always show sidebar when an area is selected (even if empty)
  if (sidebar && (selectedArea || isMyPatientsView)) {
    sidebar.style.display = 'flex';
    if (isMyPatientsView) {
      showWaitingAreaDetails({ name: 'My Patients' });
    } else if (selectedArea) {
      showWaitingAreaDetails(selectedArea);
    }
  }

  // Handle empty state - show empty message
  if (!entries || entries.length === 0) {
    const emptyMessage = isMyPatientsView 
      ? 'No assigned patients' 
      : 'No patients in this waiting area';
    container.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage}</p>
      </div>
    `;
    updateMoveButton();
    renderPagination(null); // Clear pagination
    return;
  }

  // Render each patient entry
  entries.forEach((entry) => {
    const patientItem = createPatientItem(entry);
    container.appendChild(patientItem);
  });

  // Setup event delegation for move buttons and checkboxes
  setupMoveHandlers();
  setupCheckboxHandlers();
  updateMoveButton();

  // Render pagination if needed
  if (pagination && totalPatients > PATIENTS_PER_PAGE) {
    renderPagination(pagination);
  } else {
    renderPagination(null);
  }
}

/**
 * Create a patient list item element
 * @param {Object} entry - Queue entry object
 * @returns {HTMLElement} Patient item element
 */
function createPatientItem(entry) {
  const item = document.createElement('div');
  item.className = 'patient-item';

  const patientName = entry.patient?.fullName || 'Unknown Patient';
  const checkInTime = entry.checkInTime;

  // Calculate wait time in minutes
  let waitTimeMinutes = 0;
  if (checkInTime) {
    waitTimeMinutes = Math.floor(
      (Date.now() - new Date(checkInTime)) / 60000
    );
  }

  // Format wait time
  const waitTimeText = waitTimeMinutes < 1 
    ? 'Just now' 
    : `${waitTimeMinutes} ${waitTimeMinutes === 1 ? 'min' : 'mins'}`;

  const isSelected = selectedPatientIds.has(entry.id);

  // Show waiting area name in My Patients view
  let waitingAreaInfo = '';
  if (isMyPatientsView && entry.waitingArea) {
    waitingAreaInfo = `<div class="patient-item-area">${escapeHtml(entry.waitingArea.name)}</div>`;
  } else if (isMyPatientsView && !entry.waitingArea) {
    waitingAreaInfo = '<div class="patient-item-area" style="color: #9ca3af;">No area assigned</div>';
  }

  item.setAttribute('data-entry-id', entry.id);
  item.innerHTML = `
    <input type="checkbox" class="patient-item-checkbox" data-entry-id="${entry.id}" ${isSelected ? 'checked' : ''}>
    <div class="patient-item-info">
      <div class="patient-item-name">${escapeHtml(patientName)}</div>
      <div class="patient-item-wait">- ${waitTimeText}</div>
      ${waitingAreaInfo}
    </div>
    <div class="patient-item-actions">
      <button class="move-area-btn" data-entry-id="${entry.id}">
        Move
      </button>
    </div>
  `;

  return item;
}

/**
 * Populate move dropdown options
 * @param {Object} entry - Queue entry object
 * @returns {string} HTML string of option elements
 */
function populateMoveDropdown(entry) {
  if (!waitingAreasState || waitingAreasState.length === 0) {
    return '<option value="">No areas available</option>';
  }

  const currentAreaId = entry.waitingAreaId;
  const allowedStatuses = ['WAITING', 'TRIAGE', 'CALLED'];
  
  // Only show move option if status allows waiting area assignment
  if (!allowedStatuses.includes(entry.status)) {
    return '<option value="">Cannot move from this status</option>';
  }

  let options = '';

  waitingAreasState.forEach((area) => {
    // Skip current area and inactive areas
    if (area.id === currentAreaId || !area.isActive) {
      return;
    }

    const isFull = (area.currentOccupancy ?? 0) >= (area.capacity ?? 0);
    const areaName = area.name || 'Unnamed Area';
    const label = isFull ? `${areaName} (Full)` : areaName;

    options += `<option value="${escapeHtml(area.id)}" ${isFull ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
  });

  return options || '<option value="">No other areas available</option>';
}

/**
 * Setup event delegation for move buttons
 */
function setupMoveHandlers() {
  const container = document.getElementById('waiting-area-patient-list');
  if (!container) return;

  // Remove old listener if exists
  container.removeEventListener('click', handleMoveButtonClick);

  // Use event delegation to handle move button clicks
  container.addEventListener('click', handleMoveButtonClick);
}

/**
 * Handle move button click
 */
async function handleMoveButtonClick(e) {
  if (e.target.classList.contains('move-area-btn')) {
    e.preventDefault();
    e.stopPropagation();

    const entryId = e.target.getAttribute('data-entry-id');
    if (!entryId) return;

    await handleMovePatient(entryId);
  }
}

/**
 * Setup checkbox handlers for patient selection
 */
function setupCheckboxHandlers() {
  const container = document.getElementById('waiting-area-patient-list');
  if (!container) return;

  // Remove old listener if exists
  container.removeEventListener('change', handleCheckboxChange);

  // Use event delegation to handle checkbox changes
  container.addEventListener('change', handleCheckboxChange);
}

/**
 * Handle checkbox change
 */
function handleCheckboxChange(e) {
  if (e.target.classList.contains('patient-item-checkbox')) {
    const entryId = e.target.getAttribute('data-entry-id');
    if (!entryId) return;

    if (e.target.checked) {
      selectedPatientIds.add(entryId);
    } else {
      selectedPatientIds.delete(entryId);
    }

    updateMoveButton();
  }
}

/**
 * Update move button visibility and text
 */
function updateMoveButton() {
  const moveBtn = document.getElementById('btn-move-selected');
  const selectedCount = document.getElementById('selected-count');
  
  if (!moveBtn || !selectedCount) return;

  const count = selectedPatientIds.size;
  if (count > 0) {
    moveBtn.style.display = 'block';
    selectedCount.textContent = count;
  } else {
    moveBtn.style.display = 'none';
  }
}

/**
 * Render pagination controls
 * @param {Object} pagination - Pagination info object
 */
function renderPagination(pagination) {
  const paginationContainer = document.getElementById('patient-pagination');
  if (!paginationContainer) return;

  if (!pagination || totalPatients <= PATIENTS_PER_PAGE) {
    paginationContainer.style.display = 'none';
    return;
  }

  paginationContainer.style.display = 'flex';

  const currentPageNum = pagination.page || currentPage;
  const totalPages = pagination.totalPages || Math.ceil(totalPatients / PATIENTS_PER_PAGE);
  const hasNextPage = pagination.hasNextPage || false;
  const hasPreviousPage = pagination.hasPreviousPage || false;

  const startItem = ((currentPageNum - 1) * PATIENTS_PER_PAGE) + 1;
  const endItem = Math.min(currentPageNum * PATIENTS_PER_PAGE, totalPatients);

  paginationContainer.innerHTML = `
    <button class="pagination-btn" id="pagination-prev" ${!hasPreviousPage ? 'disabled' : ''}>
      Previous
    </button>
    <span class="pagination-info">${startItem}-${endItem} of ${totalPatients}</span>
    <button class="pagination-btn" id="pagination-next" ${!hasNextPage ? 'disabled' : ''}>
      Next
    </button>
  `;

  // Add event listeners
  const prevBtn = paginationContainer.querySelector('#pagination-prev');
  const nextBtn = paginationContainer.querySelector('#pagination-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (hasPreviousPage) {
        selectedPatientIds.clear(); // Clear selections when changing page
        if (isMyPatientsView) {
          fetchMyPatients(currentPageNum - 1, false);
        } else if (selectedAreaId) {
          fetchAreaPatients(selectedAreaId, currentPageNum - 1, false);
        }
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (hasNextPage) {
        selectedPatientIds.clear(); // Clear selections when changing page
        if (isMyPatientsView) {
          fetchMyPatients(currentPageNum + 1, false);
        } else if (selectedAreaId) {
          fetchAreaPatients(selectedAreaId, currentPageNum + 1, false);
        }
      }
    });
  }
}


/**
 * Handle moving a patient to a different waiting area (single)
 * @param {string} entryId - Queue entry ID
 */
async function handleMovePatient(entryId) {
  // Find the entry in stored entries
  const entry = currentPatientEntries.find(e => e.id === entryId);
  if (!entry) {
    toast.error('Patient entry not found');
    return;
  }

  // Show modal to select destination area
  const destinationAreaId = await showMoveAreaModal();
  if (!destinationAreaId) {
    return; // User cancelled
  }

  // Disable button during request
  const container = document.getElementById('waiting-area-patient-list');
  const entryElement = container?.querySelector(`.patient-item[data-entry-id="${entryId}"]`) || 
                       container?.querySelector(`[data-entry-id="${entryId}"]`)?.closest('.patient-item');
  const moveBtn = entryElement?.querySelector('.move-area-btn');
  if (moveBtn) {
    moveBtn.disabled = true;
    moveBtn.textContent = 'Moving...';
  }

  try {
    // Check if user is ADMIN or Primary Staff
    const user = getAuthUser();
    const isAdmin = user?.role === 'ADMIN';
    const isPrimary = user?.isPrimary === true;
    const canUseBulkEndpoint = isAdmin || isPrimary;

    let response;
    let result;

    if (canUseBulkEndpoint) {
      // Use bulk endpoint for admins/primary staff (can move any patient)
      response = await apiPatch('/queue/bulk-waiting-area', {
        queueEntryIds: [entryId],
        waitingAreaId: destinationAreaId,
      });
      result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to move patient');
      }

      toast.success('Patient moved successfully');
    } else {
      // Use individual endpoint for regular staff (requires assigned doctor)
      // Backend requires a valid status transition, so we need to work around same-status limitation
      const currentStatus = entry.status || 'WAITING';
      const waitingAreaAllowedStatuses = ['WAITING', 'TRIAGE', 'CALLED'];
      
      if (!waitingAreaAllowedStatuses.includes(currentStatus)) {
        throw new Error(`Cannot move patient. Status must be WAITING, TRIAGE, or CALLED to assign waiting area. Current status: ${currentStatus}`);
      }

      // Backend doesn't allow same-status transitions (e.g., WAITING → WAITING)
      // So we need to use a valid transition while assigning the waiting area
      // Strategy: Toggle between WAITING ↔ TRIAGE to allow the move
      let targetStatus = currentStatus;
      if (currentStatus === 'WAITING') {
        targetStatus = 'TRIAGE'; // Valid transition: WAITING → TRIAGE
      } else if (currentStatus === 'TRIAGE') {
        targetStatus = 'WAITING'; // Valid transition: TRIAGE → WAITING
      } else if (currentStatus === 'CALLED') {
        // CALLED can only transition to IN_CONSULTATION or CANCELLED
        // Neither allows waiting area assignment, so we can't move CALLED patients
        throw new Error('Cannot move patient. Patients in CALLED status cannot be moved to different waiting areas.');
      }
      
      response = await apiPatch(`/queue/${entryId}/status`, {
        status: targetStatus,
        waitingAreaId: destinationAreaId,
      });
      result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to move patient');
      }

      toast.success('Patient moved successfully');
    }

    // Refresh waiting areas and patient list
    await fetchWaitingAreas();
    if (selectedAreaId) {
      await fetchAreaPatients(selectedAreaId, currentPage, false);
    } else if (isMyPatientsView) {
      await fetchMyPatients(currentPage, false);
    }

  } catch (error) {
    console.error('Error moving patient:', error);
    toast.error(error.message || 'Failed to move patient');
  } finally {
    // Re-enable button
    if (moveBtn) {
      moveBtn.disabled = false;
      moveBtn.textContent = 'Move';
    }
  }
}

/**
 * Handle bulk move of selected patients
 */
async function handleBulkMovePatients() {
  const selectedIds = Array.from(selectedPatientIds);
  if (selectedIds.length === 0) {
    toast.error('Please select at least one patient');
    return;
  }

  // Show modal to select destination area
  const destinationAreaId = await showMoveAreaModal();
  if (!destinationAreaId) {
    return; // User cancelled
  }

  const moveBtn = document.getElementById('btn-move-selected');
  if (moveBtn) {
    moveBtn.disabled = true;
    moveBtn.textContent = 'Moving...';
  }

  try {
    const response = await apiPatch('/queue/bulk-waiting-area', {
      queueEntryIds: selectedIds,
      waitingAreaId: destinationAreaId,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to move patients');
    }

    toast.success(`Successfully moved ${result.data.updatedCount} patient(s)`);

    // Clear selections
    selectedPatientIds.clear();
    updateMoveButton();

    // Refresh waiting areas and patient list
    await fetchWaitingAreas();
    if (selectedAreaId) {
      await fetchAreaPatients(selectedAreaId, currentPage, false);
    } else if (isMyPatientsView) {
      await fetchMyPatients(currentPage, false);
    }

  } catch (error) {
    console.error('Error moving patients:', error);
    toast.error(error.message || 'Failed to move patients');
  } finally {
    // Re-enable button
    if (moveBtn) {
      moveBtn.disabled = false;
      moveBtn.textContent = `Move (${selectedIds.length})`;
    }
  }
}

/**
 * Show modal to select destination waiting area
 * @returns {Promise<string|null>} Selected area ID or null if cancelled
 */
async function showMoveAreaModal() {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '2000';

    // Get available areas (exclude current)
    const availableAreas = waitingAreasState.filter(
      area => area.id !== selectedAreaId && area.isActive
    );

    if (availableAreas.length === 0) {
      toast.error('No other waiting areas available');
      resolve(null);
      return;
    }

    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 400px;">
        <div class="modal-header">
          <h2>Select Waiting Area</h2>
          <button class="modal-close" id="move-modal-close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="move-area-select">Waiting Area</label>
            <select id="move-area-select" class="move-modal-select">
              <option value="">Select Area</option>
              ${availableAreas.map(area => {
                const isFull = (area.currentOccupancy ?? 0) >= (area.capacity ?? 0);
                const label = isFull ? `${area.name} (Full)` : area.name;
                return `<option value="${area.id}" ${isFull ? 'disabled' : ''}>${label}</option>`;
              }).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="move-modal-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="move-modal-confirm">Move</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
      document.body.removeChild(overlay);
    };

    const confirmBtn = overlay.querySelector('#move-modal-confirm');
    const cancelBtn = overlay.querySelector('#move-modal-cancel');
    const closeBtn = overlay.querySelector('#move-modal-close');
    const select = overlay.querySelector('#move-area-select');

    confirmBtn.addEventListener('click', () => {
      const selectedAreaId = select.value;
      if (!selectedAreaId) {
        toast.error('Please select a waiting area');
        return;
      }
      closeModal();
      resolve(selectedAreaId);
    });

    cancelBtn.addEventListener('click', () => {
      closeModal();
      resolve(null);
    });

    closeBtn.addEventListener('click', () => {
      closeModal();
      resolve(null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
        resolve(null);
      }
    });
  });
}


/**
 * Format status text for display
 * @param {string} status - Status string (e.g., "WAITING", "IN_CONSULTATION")
 * @returns {string} Formatted status
 */
function formatStatus(status) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Setup add waiting area button and modal
 */
function setupAddWaitingAreaButton() {
  const addBtn = document.getElementById('add-waiting-area-btn');
  const modalOverlay = document.getElementById('waiting-area-modal-overlay');
  const modalClose = document.getElementById('waiting-area-modal-close');
  const modalCancel = document.getElementById('waiting-area-modal-cancel');
  const form = document.getElementById('waiting-area-form');

  if (!addBtn || !modalOverlay) return;

  // Check user permissions (Admin or Primary only)
  const user = getAuthUser();
  const isAdmin = user?.role === 'ADMIN';
  const isPrimary = user?.isPrimary === true;

  if (!isAdmin && !isPrimary) {
    // Disable button if user doesn't have permission
    addBtn.disabled = true;
    addBtn.style.cursor = 'not-allowed';
    addBtn.title = 'Only admins and primary staff can create waiting areas';
    return;
  }

  // Open modal
  addBtn.addEventListener('click', () => {
    if (modalOverlay) {
      modalOverlay.classList.add('active');
    }
  });

  // Close modal handlers
  const closeModal = () => {
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
    }
    if (form) {
      form.reset();
      form.removeAttribute('data-edit-id');
      
      // Reset modal title and button text
      const modalTitle = modalOverlay?.querySelector('.modal-header h2');
      const submitBtn = form.querySelector('button[type="submit"]');
      if (modalTitle) {
        modalTitle.textContent = 'Add New Waiting Area';
      }
      if (submitBtn) {
        submitBtn.textContent = 'Create Waiting Area';
      }
    }
  };

  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }

  if (modalCancel) {
    modalCancel.addEventListener('click', closeModal);
  }

  // Close on overlay click
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }

  // Handle form submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateWaitingArea(form);
    });
  }
}

/**
 * Handle create/update waiting area form submission
 * @param {HTMLFormElement} form - Form element
 */
async function handleCreateWaitingArea(form) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const nameInput = form.querySelector('#waiting-area-name');
  const capacityInput = form.querySelector('#waiting-area-capacity');
  const floorInput = form.querySelector('#waiting-area-floor');
  const facilityInput = form.querySelector('#waiting-area-facility');
  const isDefaultInput = form.querySelector('#waiting-area-is-default');

  if (!nameInput || !capacityInput) {
    toast.error('Form fields not found');
    return;
  }

  const name = nameInput.value.trim();
  const capacity = parseInt(capacityInput.value, 10);
  const floor = floorInput?.value.trim() || null;
  const facility = facilityInput?.value.trim() || null;
  const isDefault = isDefaultInput?.checked || false;

  // Check if editing or creating
  const editId = form.getAttribute('data-edit-id');
  const isEdit = !!editId;

  // Client-side validation
  if (!name) {
    toast.error('Waiting area name is required');
    nameInput.focus();
    return;
  }

  if (isNaN(capacity) || capacity <= 0) {
    toast.error('Capacity must be a positive number');
    capacityInput.focus();
    return;
  }

  // Disable button during request
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Updating...' : 'Creating...';
  }

  try {
    let response;
    if (isEdit) {
      // Update existing waiting area
      response = await apiPatch(`/waiting-areas/${editId}`, {
        name,
        capacity,
        floor: floor || undefined,
        facility: facility || undefined,
        isDefault,
      });
    } else {
      // Create new waiting area
      response = await apiPost('/waiting-areas', {
        name,
        capacity,
        floor: floor || undefined,
        facility: facility || undefined,
        isDefault,
      });
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || `Failed to ${isEdit ? 'update' : 'create'} waiting area`);
    }

    toast.success(`Waiting area ${isEdit ? 'updated' : 'created'} successfully`);

    // Close modal
    const modalOverlay = document.getElementById('waiting-area-modal-overlay');
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
    }

    // Reset form and remove edit ID
    form.reset();
    form.removeAttribute('data-edit-id');

    // Reset modal title
    const modalTitle = modalOverlay?.querySelector('.modal-header h2');
    if (modalTitle) {
      modalTitle.textContent = 'Add New Waiting Area';
    }

    // Refresh waiting areas list
    await fetchWaitingAreas();

  } catch (error) {
    console.error(`Error ${isEdit ? 'updating' : 'creating'} waiting area:`, error);
    toast.error(error.message || `Failed to ${isEdit ? 'update' : 'create'} waiting area`);
  } finally {
    // Re-enable button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Update Waiting Area' : 'Create Waiting Area';
    }
  }
}

/**
 * Setup My Patients toggle (doctors only)
 */
function setupMyPatientsToggle() {
  const toggleBtn = document.getElementById('btn-my-patients-toggle');
  if (!toggleBtn) return;

  // Check if user is a doctor (not admin or primary)
  const user = getAuthUser();
  const isAdmin = user?.role === 'ADMIN';
  const isPrimary = user?.isPrimary === true;
  const isDoctor = user?.role === 'STAFF' && user?.staffRole === 'DOCTOR' && !isPrimary;

  // Only show toggle for doctors
  if (!isDoctor) {
    toggleBtn.style.display = 'none';
    return;
  }

  // Show toggle button
  toggleBtn.style.display = 'block';
  updateMyPatientsToggle();

  // Add click handler
  toggleBtn.addEventListener('click', () => {
    isMyPatientsView = !isMyPatientsView;
    updateMyPatientsToggle();

    if (isMyPatientsView) {
      // Switch to My Patients view
      selectedAreaId = null;
      selectedArea = null;
      selectedPatientIds.clear();
      currentPage = 1; // Reset to first page
      highlightSelectedCard(); // Remove card selection
      fetchMyPatients(1, true);
    } else {
      // Switch back to waiting area view
      const sidebar = document.getElementById('waiting-area-details-sidebar');
      if (sidebar) {
        sidebar.style.display = 'none';
      }
      selectedAreaId = null;
      selectedArea = null;
      currentPage = 1;
    }
  });
}

/**
 * Update My Patients toggle button state
 */
function updateMyPatientsToggle() {
  const toggleBtn = document.getElementById('btn-my-patients-toggle');
  const toggleText = document.getElementById('my-patients-toggle-text');
  
  if (!toggleBtn || !toggleText) return;

  if (isMyPatientsView) {
    toggleBtn.classList.add('active');
    toggleText.textContent = 'Waiting Areas';
  } else {
    toggleBtn.classList.remove('active');
    toggleText.textContent = 'My Patients';
  }
}

/**
 * Start polling for auto-refresh
 */
function startPolling() {
  // Clear existing interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  // Poll every 15 seconds (without showing spinner)
  pollingInterval = setInterval(() => {
    // Refresh waiting areas
    fetchWaitingAreas();
    
    // Refresh current view (waiting area or my patients)
    if (isMyPatientsView) {
      fetchMyPatients(currentPage, false);
    } else if (selectedAreaId) {
      fetchAreaPatients(selectedAreaId, currentPage, false);
    }
  }, 15000); // 15 seconds
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
 * Initialize waiting area page
 */
function initializeWaitingArea() {
  // Check authentication
  if (!isAuthenticated()) {
    toast.error('Please log in to access waiting areas');
    window.location.href = '/login.html';
    return;
  }

  // Setup add button and modal
  setupAddWaitingAreaButton();

  // Setup delete confirmation modal
  setupDeleteModal();

  // Setup filter dropdowns
  setupFilters();

  // Setup bulk move button
  const bulkMoveBtn = document.getElementById('btn-move-selected');
  if (bulkMoveBtn) {
    bulkMoveBtn.addEventListener('click', handleBulkMovePatients);
  }

  // Setup My Patients toggle (doctors only)
  setupMyPatientsToggle();

  // Hide sidebar initially
  const sidebar = document.getElementById('waiting-area-details-sidebar');
  if (sidebar) {
    sidebar.style.display = 'none';
  }

  // Fetch waiting areas on page load
  fetchWaitingAreas();

  // Start polling for auto-refresh
  startPolling();
}

// Store filter handlers for cleanup
let facilityFilterHandler = null;
let floorFilterHandler = null;

/**
 * Setup filter dropdown event listeners
 */
function setupFilters() {
  const facilityFilter = document.getElementById('facility-filter');
  const floorFilter = document.getElementById('floor-filter');

  // Remove old handlers if they exist
  if (facilityFilter && facilityFilterHandler) {
    facilityFilter.removeEventListener('change', facilityFilterHandler);
  }
  if (floorFilter && floorFilterHandler) {
    floorFilter.removeEventListener('change', floorFilterHandler);
  }

  // Create new handlers
  if (facilityFilter) {
    facilityFilterHandler = () => {
      renderWaitingAreas(waitingAreas);
    };
    facilityFilter.addEventListener('change', facilityFilterHandler);
  }

  if (floorFilter) {
    floorFilterHandler = () => {
      renderWaitingAreas(waitingAreas);
    };
    floorFilter.addEventListener('change', floorFilterHandler);
  }
}

/**
 * Setup delete confirmation modal handlers
 */
function setupDeleteModal() {
  const deleteModal = document.getElementById('delete-waiting-area-modal-overlay');
  const deleteConfirm = document.getElementById('delete-modal-confirm');
  const deleteCancel = document.getElementById('delete-modal-cancel');
  const deleteClose = document.getElementById('delete-modal-close');

  if (!deleteModal) return;

  // Confirm delete
  if (deleteConfirm) {
    deleteConfirm.addEventListener('click', confirmDeleteWaitingArea);
  }

  // Cancel delete
  if (deleteCancel) {
    deleteCancel.addEventListener('click', cancelDeleteWaitingArea);
  }

  // Close modal
  if (deleteClose) {
    deleteClose.addEventListener('click', cancelDeleteWaitingArea);
  }

  // Close on overlay click
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      cancelDeleteWaitingArea();
    }
  });
}

/**
 * Handle edit waiting area
 * @param {Object} area - Waiting area object
 */
function handleEditWaitingArea(area) {
  // Populate form with existing data
  const form = document.getElementById('waiting-area-form');
  const modalOverlay = document.getElementById('waiting-area-modal-overlay');
  
  if (!form || !modalOverlay) return;

  // Set form values
  const nameInput = form.querySelector('#waiting-area-name');
  const capacityInput = form.querySelector('#waiting-area-capacity');
  const floorInput = form.querySelector('#waiting-area-floor');
  const facilityInput = form.querySelector('#waiting-area-facility');
  const isDefaultInput = form.querySelector('#waiting-area-is-default');

  if (nameInput) nameInput.value = area.name || '';
  if (capacityInput) capacityInput.value = area.capacity || '';
  if (floorInput) floorInput.value = area.floor || '';
  if (facilityInput) facilityInput.value = area.facility || '';
  if (isDefaultInput) isDefaultInput.checked = area.isDefault === true;

  // Update modal title
  const modalTitle = modalOverlay.querySelector('.modal-header h2');
  if (modalTitle) {
    modalTitle.textContent = 'Edit Waiting Area';
  }

  // Update submit button text
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = 'Update Waiting Area';
  }

  // Store area ID for update
  form.setAttribute('data-edit-id', area.id);

  // Open modal
  modalOverlay.classList.add('active');
}

// Store area to delete for confirmation modal
let areaToDelete = null;

/**
 * Handle delete waiting area (soft delete via isActive)
 * @param {Object} area - Waiting area object
 */
function handleDeleteWaitingArea(area) {
  // Store area for confirmation
  areaToDelete = area;

  // Show delete confirmation modal
  const deleteModal = document.getElementById('delete-waiting-area-modal-overlay');
  if (deleteModal) {
    // Update modal text
    const modalText = deleteModal.querySelector('.delete-modal-text');
    if (modalText) {
      modalText.textContent = `Are you sure you want to delete "${area.name}"?`;
    }
    const modalDescription = deleteModal.querySelector('.delete-modal-description');
    if (modalDescription) {
      modalDescription.textContent = 'This will deactivate the waiting area. Patients currently in this area will not be affected, but no new patients can be assigned.';
    }
    deleteModal.classList.add('active');
  }
}

/**
 * Confirm delete waiting area
 */
async function confirmDeleteWaitingArea() {
  if (!areaToDelete) return;

  const area = areaToDelete;
  areaToDelete = null;

  // Close modal
  const deleteModal = document.getElementById('delete-waiting-area-modal-overlay');
  if (deleteModal) {
    deleteModal.classList.remove('active');
  }

  try {
    const response = await apiPatch(`/waiting-areas/${area.id}`, {
      isActive: false,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to delete waiting area');
    }

    toast.success('Waiting area deleted successfully');

    // Refresh waiting areas list (this will also update filters)
    await fetchWaitingAreas();

    // Clear patient list if this area was selected
    if (selectedAreaId === area.id) {
      selectedAreaId = null;
      selectedArea = null;
      selectedPatientIds.clear();
      const sidebar = document.getElementById('waiting-area-details-sidebar');
      if (sidebar) {
        sidebar.style.display = 'none';
      }
      const container = document.getElementById('waiting-area-patient-list');
      if (container) {
        container.innerHTML = '<div class="empty-state"><p>Select a waiting area to view patients</p></div>';
      }
    }

  } catch (error) {
    console.error('Error deleting waiting area:', error);
    toast.error(error.message || 'Failed to delete waiting area');
  }
}

/**
 * Cancel delete waiting area
 */
function cancelDeleteWaitingArea() {
  areaToDelete = null;
  const deleteModal = document.getElementById('delete-waiting-area-modal-overlay');
  if (deleteModal) {
    deleteModal.classList.remove('active');
  }
}

// Export for potential use by navigation system
export { fetchWaitingAreas, renderWaitingAreas, initializeWaitingArea };

// Listen for view-loaded event (SPA navigation)
window.addEventListener('view-loaded', async (event) => {
  if (event.detail?.route === 'waiting-area') {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      initializeWaitingArea();
    }, 100);
  }
}, { once: false }); // Allow multiple calls when navigating back

// Auto-initialize if page is loaded directly (non-SPA)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWaitingArea);
} else {
  // Check if we're in SPA mode (app-content exists) or standalone page
  const contentEl = document.getElementById('app-content');
  if (!contentEl) {
    // Standalone page, initialize immediately
    initializeWaitingArea();
  }
}
