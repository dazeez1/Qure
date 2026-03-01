/**
 * Waiting Area Management Page
 * Handles waiting area display and management
 */

'use strict';

import { apiGet, apiPatch, apiPost } from '../../utils/apiClient.js';
import { getAuthUser, isAuthenticated } from '../../utils/auth.js';
import { toast } from '../../utils/toast.js';
import { API_ENDPOINTS } from '../../config/api.js';

// State
let waitingAreas = [];
let waitingAreasState = [];
let selectedAreaId = null;

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
    selectedAreaId = area.id;
    highlightSelectedCard();
    fetchAreaPatients(area.id);
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
 */
async function fetchAreaPatients(waitingAreaId) {
  try {
    const response = await apiGet(`/staff/queue?waitingAreaId=${waitingAreaId}`);
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch patients');
    }

    const entries = result.data.queueEntries || [];
    renderAreaPatients(entries);
  } catch (error) {
    console.error('Error fetching area patients:', error);
    toast.error(error.message || 'Failed to load patients');
    // Clear patient list on error
    const container = document.getElementById('waiting-area-patient-list');
    if (container) {
      container.innerHTML = '<div class="empty-state"><p>Failed to load patients</p></div>';
    }
  }
}

// Store entries for move handler access
let currentPatientEntries = [];

/**
 * Render patients in the waiting area
 * @param {Array} entries - Array of queue entry objects
 */
function renderAreaPatients(entries) {
  const container = document.getElementById('waiting-area-patient-list');
  
  if (!container) {
    console.error('Patient list container not found');
    return;
  }

  // Store entries globally for move handler
  currentPatientEntries = entries || [];

  // Clear container
  container.innerHTML = '';

  // Handle empty state
  if (!entries || entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No patients in this area</p>
      </div>
    `;
    return;
  }

  // Render each patient entry
  entries.forEach((entry) => {
    const patientItem = createPatientItem(entry);
    container.appendChild(patientItem);
  });

  // Setup event delegation for move buttons
  setupMoveHandlers();
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
  const status = entry.status || 'UNKNOWN';
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

  // Format status
  const statusText = formatStatus(status);
  const statusClass = status.toLowerCase().replace(/_/g, '-');

  // Populate dropdown with waiting areas
  const dropdownOptions = populateMoveDropdown(entry);

  item.innerHTML = `
    <div class="patient-item-info">
      <div class="patient-item-name">${escapeHtml(patientName)}</div>
      <div class="patient-item-wait">${waitTimeText}</div>
      <span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span>
    </div>
    <div class="patient-item-actions">
      <select class="move-area-select" data-entry-id="${entry.id}">
        <option value="">Select area...</option>
        ${dropdownOptions}
      </select>
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

  // Use event delegation to handle move button clicks
  container.addEventListener('click', async (e) => {
    if (e.target.classList.contains('move-area-btn')) {
      e.preventDefault();
      e.stopPropagation();

      const entryId = e.target.getAttribute('data-entry-id');
      if (!entryId) return;

      await handleMovePatient(entryId);
    }
  });
}

/**
 * Handle moving a patient to a different waiting area
 * @param {string} entryId - Queue entry ID
 */
async function handleMovePatient(entryId) {
  // Find the entry in stored entries
  const entry = currentPatientEntries.find(e => e.id === entryId);
  if (!entry) {
    toast.error('Patient entry not found');
    return;
  }

  // Get the select dropdown for this entry
  const container = document.getElementById('waiting-area-patient-list');
  if (!container) return;

  const select = container.querySelector(`.move-area-select[data-entry-id="${entryId}"]`);
  if (!select) return;

  const destinationAreaId = select.value;
  if (!destinationAreaId) {
    toast.error('Please select a waiting area');
    return;
  }

  // Get status from entry
  const status = entry.status || 'WAITING';
  
  // Store source area ID (where patient is currently)
  const sourceAreaId = entry.waitingAreaId;

  // Disable button during request
  const entryElement = select.closest('.patient-item');
  const moveBtn = entryElement?.querySelector('.move-area-btn');
  if (moveBtn) {
    moveBtn.disabled = true;
    moveBtn.textContent = 'Moving...';
  }

  try {
    const response = await apiPatch(`/queue/${entryId}/status`, {
      status: status,
      waitingAreaId: destinationAreaId,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to move patient');
    }

    toast.success('Patient moved successfully');

    // Refresh waiting areas (updates occupancy for both source and destination)
    // This recalculates occupancy counts for all areas
    await fetchWaitingAreas();
    
    // Refresh patient list for the currently viewed area (if any)
    // selectedAreaId is the area currently being viewed (global state)
    // If patient was moved from this area, it will be removed from the list
    // If patient was moved to this area, it will be added to the list
    if (selectedAreaId) {
      await fetchAreaPatients(selectedAreaId);
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
    // Hide button if user doesn't have permission
    addBtn.style.display = 'none';
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

  // Fetch waiting areas on page load
  fetchWaitingAreas();
}

/**
 * Setup filter dropdown event listeners
 */
function setupFilters() {
  const facilityFilter = document.getElementById('facility-filter');
  const floorFilter = document.getElementById('floor-filter');

  if (facilityFilter) {
    facilityFilter.addEventListener('change', () => {
      renderWaitingAreas(waitingAreas);
    });
  }

  if (floorFilter) {
    floorFilter.addEventListener('change', () => {
      renderWaitingAreas(waitingAreas);
    });
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

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWaitingArea);
} else {
  initializeWaitingArea();
}

// Export for potential use by navigation system
export { fetchWaitingAreas, renderWaitingAreas };
