/**
 * Rooms Settings Handler
 * Handles rooms table rendering, add, and edit
 * Integrated with backend API
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { apiGet, apiPost, apiPatch } from '../../utils/apiClient.js';
import { getAuthUser } from '../../utils/auth.js';

// Rooms data - fetched from API
let rooms = [];
let departments = [];
let isLoading = false;
let canManageRooms = false; // Only primary staff or admin can manage

/**
 * Initialize Rooms UI
 */
export function initRoomsUI() {
  // Check user permissions
  checkUserPermissions();

  // Set up event listeners
  setupEventListeners();

  // Fetch departments first (needed for dropdown)
  fetchDepartments().then(() => {
    // Then fetch rooms
    fetchRooms();
  });
}

/**
 * Check if user can manage rooms (primary staff or admin)
 */
function checkUserPermissions() {
  const user = getAuthUser();
  if (user) {
    canManageRooms = user.isPrimary === true || user.role === 'ADMIN';
  } else {
    canManageRooms = false;
  }
}

/**
 * Fetch departments from API (for dropdown)
 */
async function fetchDepartments() {
  try {
    const response = await apiGet('/settings/departments');
    const result = await response.json();

    if (response.ok && result.success) {
      departments = result.data.departments || [];
      populateDepartmentDropdowns();
    }
  } catch (error) {
    console.error('Error fetching departments:', error);
  }
}

/**
 * Populate department dropdowns in modals
 */
function populateDepartmentDropdowns() {
  const addDropdown = document.getElementById('add-room-department');
  if (addDropdown) {
    // Clear existing options except the first one
    addDropdown.innerHTML = '<option value="">Select a department</option>';
    
    // Add active departments only
    departments
      .filter(dept => dept.status === 'ACTIVE')
      .forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = dept.name;
        addDropdown.appendChild(option);
      });
  }
}

/**
 * Fetch rooms from API
 */
async function fetchRooms() {
  const tableBody = document.getElementById('rooms-table-body');
  
  if (isLoading) return;
  isLoading = true;

  // Show loading state
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #6b7280;">
          Loading rooms...
        </td>
      </tr>
    `;
  }

  try {
    const response = await apiGet('/rooms?includeInactive=true');
    const result = await response.json();

    if (response.ok && result.success) {
      // Update rooms array
      rooms = result.data.rooms || [];
      
      // Re-render table
      renderRooms();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to load rooms');
      
      // Show error state
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #dc2626;">
              Failed to load rooms. Please try again.
            </td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error('Error fetching rooms:', error);
    toast.error('Failed to load rooms. Please try again.');
    
    // Show error state
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #dc2626;">
            Failed to load rooms. Please try again.
          </td>
        </tr>
      `;
    }
  } finally {
    isLoading = false;
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Add Room button
  const addRoomBtn = document.getElementById('add-room-btn');
  if (addRoomBtn) {
    // Disable button for regular staff
    if (!canManageRooms) {
      addRoomBtn.disabled = true;
      addRoomBtn.style.opacity = '0.5';
      addRoomBtn.style.cursor = 'not-allowed';
      addRoomBtn.title = 'Only primary staff or administrators can add rooms';
    } else {
      addRoomBtn.addEventListener('click', openAddModal);
    }
  }

  // Add Room form
  const addForm = document.getElementById('add-room-form');
  if (addForm) {
    addForm.addEventListener('submit', handleCreate);
    setupFormValidation(addForm, 'add');
  }

  // Edit Room form
  const editForm = document.getElementById('edit-room-form');
  if (editForm) {
    editForm.addEventListener('submit', handleUpdate);
    setupFormValidation(editForm, 'edit');
  }

  // Modal close buttons
  setupModalCloseHandlers();
}

/**
 * Setup form validation
 */
function setupFormValidation(form, formType) {
  const prefix = formType === 'add' ? 'add' : 'edit';
  const roomNameInput = document.getElementById(`${prefix}-room-name`);

  // Only validate on blur (after user interacts) or on submit
  if (roomNameInput) {
    roomNameInput.addEventListener('blur', () => {
      if (roomNameInput.value.trim().length > 0) {
        validateRoomName(roomNameInput.value, prefix);
      }
    });
  }
}

/**
 * Validate room name
 */
function validateRoomName(name, prefix) {
  if (!name || name.trim().length === 0) {
    showFieldError(prefix, 'name', 'Room name is required');
    return false;
  }

  if (name.trim().length < 2) {
    showFieldError(prefix, 'name', 'Room name must be at least 2 characters');
    return false;
  }

  clearFieldError(prefix, 'name');
  return true;
}

/**
 * Show field error
 */
function showFieldError(prefix, fieldName, message) {
  const errorElement = document.getElementById(`${prefix}-room-${fieldName}-error`);
  const inputElement = document.getElementById(`${prefix}-room-${fieldName}`);

  if (errorElement) {
    errorElement.textContent = message;
  }

  if (inputElement) {
    inputElement.classList.add('error');
  }
}

/**
 * Clear field error
 */
function clearFieldError(prefix, fieldName) {
  const errorElement = document.getElementById(`${prefix}-room-${fieldName}-error`);
  const inputElement = document.getElementById(`${prefix}-room-${fieldName}`);

  if (errorElement) {
    errorElement.textContent = '';
  }

  if (inputElement) {
    inputElement.classList.remove('error');
  }
}

/**
 * Clear all errors
 */
function clearAllErrors(prefix) {
  clearFieldError(prefix, 'name');
  clearFieldError(prefix, 'department');
}

/**
 * Setup modal close handlers
 */
function setupModalCloseHandlers() {
  // Add modal
  const addModal = document.getElementById('add-room-modal');
  const closeAddModalBtn = document.getElementById('close-add-modal');
  const cancelAddBtn = document.getElementById('cancel-add-room-btn');

  if (closeAddModalBtn) {
    closeAddModalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeAddModal();
    });
  }

  if (cancelAddBtn) {
    cancelAddBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeAddModal();
    });
  }

  if (addModal) {
    addModal.addEventListener('click', (e) => {
      if (e.target === addModal) {
        closeAddModal();
      }
    });
  }

  // Edit modal
  const editModal = document.getElementById('edit-room-modal');
  const closeEditModalBtn = document.getElementById('close-edit-modal');
  const cancelEditBtn = document.getElementById('cancel-edit-room-btn');

  if (closeEditModalBtn) {
    closeEditModalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeEditModal();
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeEditModal();
    });
  }

  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) {
        closeEditModal();
      }
    });
  }
}

/**
 * Render rooms table from API data
 */
function renderRooms() {
  const tableBody = document.getElementById('rooms-table-body');
  if (!tableBody) {
    return;
  }

  // Clear existing rows
  tableBody.innerHTML = '';

  // Render each room
  rooms.forEach((room) => {
    const row = createRoomRow(room);
    tableBody.appendChild(row);
  });

  // If no rooms, show empty state
  if (rooms.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #6b7280;">
        No rooms found. Click "Add New Room" to create one.
      </td>
    `;
    tableBody.appendChild(emptyRow);
  }
}

/**
 * Create room table row
 */
function createRoomRow(room) {
  const row = document.createElement('tr');
  row.dataset.roomId = room.id;

  const statusClass = room.isActive ? 'active' : 'inactive';
  const statusText = room.isActive ? 'Active' : 'Inactive';

  row.innerHTML = `
    <td>${escapeHtml(room.name)}</td>
    <td>${escapeHtml(room.department?.name || 'N/A')}</td>
    <td>
      <span class="status-badge ${statusClass}">
        ${statusText}
      </span>
    </td>
    <td>
      <div class="action-buttons">
        ${canManageRooms ? `
        <button type="button" class="action-btn edit-btn" data-room-id="${room.id}" title="Edit room">
          <span class="material-symbols-outlined">edit</span>
        </button>
        ` : `
        <button type="button" class="action-btn edit-btn" disabled style="opacity: 0.5; cursor: not-allowed;" title="Only primary staff or administrators can edit rooms">
          <span class="material-symbols-outlined">edit</span>
        </button>
        `}
      </div>
    </td>
  `;

  // Add event listeners only if user can manage
  const editBtn = row.querySelector('.edit-btn');

  if (editBtn && canManageRooms && !editBtn.disabled) {
    editBtn.addEventListener('click', () => openEditModal(room.id));
  }

  return row;
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
 * Open Add Room Modal
 */
export function openAddModal() {
  const modal = document.getElementById('add-room-modal');
  const form = document.getElementById('add-room-form');

  if (modal && form) {
    // Reset form
    form.reset();
    clearAllErrors('add');

    // Populate department dropdown
    populateDepartmentDropdowns();

    // Show modal
    modal.style.display = 'flex';

    // Focus on first input
    const firstInput = document.getElementById('add-room-name');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }

    // Enable save button
    const saveButton = document.getElementById('save-add-room-btn');
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

/**
 * Close Add Room Modal
 */
function closeAddModal() {
  const modal = document.getElementById('add-room-modal');
  const form = document.getElementById('add-room-form');

  if (modal) {
    modal.style.display = 'none';
  }

  if (form) {
    form.reset();
    clearAllErrors('add');
  }
}

/**
 * Handle Create Room
 */
async function handleCreate(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const saveButton = document.getElementById('save-add-room-btn');

  const roomName = formData.get('roomName')?.trim() || '';
  const departmentId = formData.get('departmentId') || '';

  // Clear previous errors first
  clearAllErrors('add');

  // Validate
  const nameValid = validateRoomName(roomName, 'add');
  
  if (!departmentId) {
    showFieldError('add', 'department', 'Department is required');
  } else {
    clearFieldError('add', 'department');
  }

  if (!nameValid || !departmentId) {
    toast.error('Please fix the errors in the form');
    return;
  }

  // Disable button and show loading state
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
  }

  try {
    // Call API
    const response = await apiPost('/rooms', {
      name: roomName,
      departmentId: departmentId,
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Success - re-fetch rooms
      await fetchRooms();

      // Close modal
      closeAddModal();

      // Show success toast
      toast.success('Room added successfully');
    } else {
      // Error from API
      const errorMessage = result.message || 'Failed to create room';
      toast.error(errorMessage);

      // Show field errors if provided
      if (result.errors) {
        Object.keys(result.errors).forEach((field) => {
          showFieldError('add', field, result.errors[field]);
        });
      }
    }
  } catch (error) {
    console.error('Error creating room:', error);
    toast.error('Failed to create room. Please try again.');
  } finally {
    // Re-enable button
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save';
    }
  }
}

/**
 * Open Edit Room Modal
 */
export function openEditModal(roomId) {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    toast.error('Room not found');
    return;
  }

  const modal = document.getElementById('edit-room-modal');
  const form = document.getElementById('edit-room-form');
  const idInput = document.getElementById('edit-room-id');
  const nameInput = document.getElementById('edit-room-name');
  const statusSelect = document.getElementById('edit-room-status');

  if (modal && form && idInput && nameInput && statusSelect) {
    // Populate form
    idInput.value = room.id;
    nameInput.value = room.name;
    statusSelect.value = room.isActive ? 'true' : 'false';

    // Clear errors
    clearAllErrors('edit');

    // Show modal
    modal.style.display = 'flex';

    // Focus on first input
    setTimeout(() => nameInput.focus(), 100);

    // Enable save button
    const saveButton = document.getElementById('save-edit-room-btn');
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

/**
 * Close Edit Room Modal
 */
function closeEditModal() {
  const modal = document.getElementById('edit-room-modal');
  const form = document.getElementById('edit-room-form');

  if (modal) {
    modal.style.display = 'none';
  }

  if (form) {
    form.reset();
    clearAllErrors('edit');
  }
}

/**
 * Handle Update Room
 */
async function handleUpdate(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const saveButton = document.getElementById('save-edit-room-btn');

  const roomId = formData.get('roomId');
  const roomName = formData.get('roomName')?.trim() || '';
  const isActive = formData.get('isActive') === 'true';

  if (!roomId) {
    toast.error('Room ID is missing');
    return;
  }

  // Clear previous errors first
  clearAllErrors('edit');

  // Validate
  const nameValid = validateRoomName(roomName, 'edit');

  if (!nameValid) {
    toast.error('Please fix the errors in the form');
    return;
  }

  // Disable button and show loading state
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
  }

  try {
    // Call API
    const response = await apiPatch(`/rooms/${roomId}`, {
      name: roomName,
      isActive: isActive,
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Success - re-fetch rooms
      await fetchRooms();

      // Close modal
      closeEditModal();

      // Show success toast
      toast.success('Room updated successfully');
    } else {
      // Error from API
      const errorMessage = result.message || 'Failed to update room';
      toast.error(errorMessage);

      // Show field errors if provided
      if (result.errors) {
        Object.keys(result.errors).forEach((field) => {
          showFieldError('edit', field, result.errors[field]);
        });
      }
    }
  } catch (error) {
    console.error('Error updating room:', error);
    toast.error('Failed to update room. Please try again.');
  } finally {
    // Re-enable button
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save';
    }
  }
}
