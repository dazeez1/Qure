/**
 * Departments Settings Handler
 * Handles departments table rendering, add, edit, delete, and status toggle
 * Integrated with backend API
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../../utils/apiClient.js';
import { getAuthUser } from '../../utils/auth.js';

// Departments data - fetched from API
let departments = [];
let isLoading = false;
let canManageDepartments = false; // Only primary staff or admin can manage

/**
 * Initialize Departments UI
 */
export function initDepartmentsUI() {
  // Check user permissions
  checkUserPermissions();

  // Set up event listeners
  setupEventListeners();

  // Fetch departments from API
  fetchDepartments();
}

/**
 * Check if user can manage departments (primary staff or admin)
 */
function checkUserPermissions() {
  const user = getAuthUser();
  if (user) {
    canManageDepartments = user.isPrimary === true || user.role === 'ADMIN';
  } else {
    canManageDepartments = false;
  }
}

/**
 * Fetch departments from API
 * Step 1: Replace mock GET
 */
async function fetchDepartments() {
  const tableBody = document.getElementById('departments-table-body');
  
  if (isLoading) return;
  isLoading = true;

  // Show loading state
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #6b7280;">
          Loading departments...
        </td>
      </tr>
    `;
  }

  try {
    const response = await apiGet('/settings/departments');
    const result = await response.json();

    if (response.ok && result.success) {
      // Update departments array
      departments = result.data.departments || [];
      
      // Re-render table
      renderDepartments();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to load departments');
      
      // Show error state
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #dc2626;">
              Failed to load departments. Please try again.
            </td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error('Error fetching departments:', error);
    toast.error('Failed to load departments. Please try again.');
    
    // Show error state
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #dc2626;">
            Failed to load departments. Please try again.
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
  // Add Department button
  const addDepartmentBtn = document.getElementById('add-department-btn');
  if (addDepartmentBtn) {
    // Disable button for regular staff
    if (!canManageDepartments) {
      addDepartmentBtn.disabled = true;
      addDepartmentBtn.style.opacity = '0.5';
      addDepartmentBtn.style.cursor = 'not-allowed';
      addDepartmentBtn.title = 'Only primary staff or administrators can add departments';
    } else {
      addDepartmentBtn.addEventListener('click', openAddModal);
    }
  }

  // Add Department form
  const addForm = document.getElementById('add-department-form');
  if (addForm) {
    addForm.addEventListener('submit', handleCreate);
    setupFormValidation(addForm, 'add');
  }

  // Edit Department form
  const editForm = document.getElementById('edit-department-form');
  if (editForm) {
    editForm.addEventListener('submit', handleUpdate);
    setupFormValidation(editForm, 'edit');
  }

  // Modal close buttons
  setupModalCloseHandlers();

  // Short code auto-uppercase
  setupShortCodeInputs();
}

/**
 * Setup form validation
 */
function setupFormValidation(form, formType) {
  const prefix = formType === 'add' ? 'add' : 'edit';
  const departmentNameInput = document.getElementById(`${prefix}-department-name`);
  const shortCodeInput = document.getElementById(`${prefix}-department-short-code`);

  // Only validate on blur (after user interacts) or on submit
  // Don't show errors on initial load or while typing
  if (departmentNameInput) {
    departmentNameInput.addEventListener('blur', () => {
      if (departmentNameInput.value.trim().length > 0) {
        validateDepartmentName(departmentNameInput.value, prefix);
      }
    });
  }

  if (shortCodeInput) {
    shortCodeInput.addEventListener('blur', () => {
      if (shortCodeInput.value.trim().length > 0) {
        validateShortCode(shortCodeInput.value, prefix, formType);
      }
    });
  }
}

/**
 * Setup short code inputs to auto-uppercase
 */
function setupShortCodeInputs() {
  const addShortCodeInput = document.getElementById('add-department-short-code');
  const editShortCodeInput = document.getElementById('edit-department-short-code');

  [addShortCodeInput, editShortCodeInput].forEach((input) => {
    if (input) {
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
      });
    }
  });
}

/**
 * Validate department name
 */
function validateDepartmentName(name, prefix) {
  const errorElement = document.getElementById(`${prefix}-department-name-error`);
  const inputElement = document.getElementById(`${prefix}-department-name`);

  if (!name || name.trim().length === 0) {
    showFieldError(prefix, 'name', 'Department name is required');
    return false;
  }

  if (name.trim().length < 2) {
    showFieldError(prefix, 'name', 'Department name must be at least 2 characters');
    return false;
  }

  clearFieldError(prefix, 'name');
  return true;
}

/**
 * Validate short code
 */
function validateShortCode(shortCode, prefix, formType) {
  const errorElement = document.getElementById(`${prefix}-department-short-code-error`);
  const inputElement = document.getElementById(`${prefix}-department-short-code`);

  if (!shortCode || shortCode.trim().length === 0) {
    showFieldError(prefix, 'short-code', 'Short code is required');
    return false;
  }

  if (shortCode.length < 3 || shortCode.length > 4) {
    showFieldError(prefix, 'short-code', 'Short code must be 3-4 characters');
    return false;
  }

  // Check for duplicate short code (excluding current department if editing)
  const isDuplicate = checkDuplicateShortCode(shortCode, formType === 'edit' ? getEditingDepartmentId() : null);
  if (isDuplicate) {
    showFieldError(prefix, 'short-code', 'Short code already exists');
    return false;
  }

  clearFieldError(prefix, 'short-code');
  return true;
}

/**
 * Check for duplicate short code
 */
function checkDuplicateShortCode(shortCode, excludeId = null) {
  return departments.some((dept) => {
    if (excludeId && dept.id === excludeId) {
      return false;
    }
    return dept.shortCode.toUpperCase() === shortCode.toUpperCase();
  });
}

/**
 * Get editing department ID
 */
function getEditingDepartmentId() {
  const editIdInput = document.getElementById('edit-department-id');
  return editIdInput ? editIdInput.value : null;
}

/**
 * Show field error
 */
function showFieldError(prefix, fieldName, message) {
  const errorElement = document.getElementById(`${prefix}-department-${fieldName}-error`);
  const inputElement = document.getElementById(`${prefix}-department-${fieldName}`);

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
  const errorElement = document.getElementById(`${prefix}-department-${fieldName}-error`);
  const inputElement = document.getElementById(`${prefix}-department-${fieldName}`);

  if (errorElement) {
    errorElement.textContent = '';
  }

  if (inputElement) {
    inputElement.classList.remove('error');
  }
}

/**
 * Setup modal close handlers
 */
function setupModalCloseHandlers() {
  // Add modal
  const addModal = document.getElementById('add-department-modal');
  const closeAddModalBtn = document.getElementById('close-add-modal');
  const cancelAddBtn = document.getElementById('cancel-add-department-btn');

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
  const editModal = document.getElementById('edit-department-modal');
  const closeEditModalBtn = document.getElementById('close-edit-modal');
  const cancelEditBtn = document.getElementById('cancel-edit-department-btn');

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

  // Delete modal
  const deleteModal = document.getElementById('delete-department-modal');
  const closeDeleteModalBtn = document.getElementById('close-delete-modal');
  const cancelDeleteBtn = document.getElementById('cancel-delete-department-btn');

  if (closeDeleteModalBtn) {
    closeDeleteModalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeDeleteModal();
    });
  }

  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeDeleteModal();
    });
  }

  if (deleteModal) {
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) {
        closeDeleteModal();
      }
    });
  }
}

/**
 * Render departments table from API data
 */
function renderDepartments() {
  const tableBody = document.getElementById('departments-table-body');
  if (!tableBody) {
    return;
  }

  // Clear existing rows
  tableBody.innerHTML = '';

  // Render each department
  departments.forEach((department) => {
    const row = createDepartmentRow(department);
    tableBody.appendChild(row);
  });

  // If no departments, show empty state
  if (departments.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="4" style="text-align: center; padding: 4rem 2rem; color: #6b7280;">
        No departments found. Click "Add New Department" to create one.
      </td>
    `;
    tableBody.appendChild(emptyRow);
  }
}

/**
 * Create department table row
 */
function createDepartmentRow(department) {
  const row = document.createElement('tr');
  row.dataset.departmentId = department.id;

  const statusClass = department.status === 'ACTIVE' ? 'active' : 'inactive';
  const statusText = department.status === 'ACTIVE' ? 'Active' : 'Inactive';

  // Only allow status toggle for primary staff/admin
  const statusBadgeClickable = canManageDepartments ? '' : 'style="cursor: default; opacity: 0.6;"';

  row.innerHTML = `
    <td>${escapeHtml(department.name)}</td>
    <td>${escapeHtml(department.shortCode)}</td>
    <td>
      <span class="status-badge ${statusClass}" data-department-id="${department.id}" data-status="${department.status}" ${statusBadgeClickable}>
        ${statusText}
      </span>
    </td>
    <td>
      <div class="action-buttons">
        ${canManageDepartments ? `
        <button type="button" class="action-btn edit-btn" data-department-id="${department.id}" title="Edit department">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button type="button" class="action-btn delete-btn" data-department-id="${department.id}" title="Delete department">
          <span class="material-symbols-outlined">delete</span>
        </button>
        ` : `
        <button type="button" class="action-btn edit-btn" disabled style="opacity: 0.5; cursor: not-allowed;" title="Only primary staff or administrators can edit departments">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button type="button" class="action-btn delete-btn" disabled style="opacity: 0.5; cursor: not-allowed;" title="Only primary staff or administrators can delete departments">
          <span class="material-symbols-outlined">delete</span>
        </button>
        `}
      </div>
    </td>
  `;

  // Add event listeners only if user can manage
  const editBtn = row.querySelector('.edit-btn');
  const deleteBtn = row.querySelector('.delete-btn');
  const statusBadge = row.querySelector('.status-badge');

  if (editBtn && canManageDepartments && !editBtn.disabled) {
    editBtn.addEventListener('click', () => openEditModal(department.id));
  }

  if (deleteBtn && canManageDepartments && !deleteBtn.disabled) {
    deleteBtn.addEventListener('click', () => deleteDepartment(department.id));
  }

  if (statusBadge && canManageDepartments) {
    statusBadge.addEventListener('click', () => handleToggle(department.id));
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
 * Open Add Department Modal
 */
export function openAddModal() {
  const modal = document.getElementById('add-department-modal');
  const form = document.getElementById('add-department-form');

  if (modal && form) {
    // Reset form
    form.reset();
    clearAllErrors('add');

    // Show modal
    modal.style.display = 'flex';

    // Focus on first input
    const firstInput = document.getElementById('add-department-name');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }

    // Enable save button - validation will happen on submit
    const saveButton = document.getElementById('save-add-department-btn');
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

/**
 * Close Add Department Modal
 */
function closeAddModal() {
  const modal = document.getElementById('add-department-modal');
  const form = document.getElementById('add-department-form');

  if (modal) {
    modal.style.display = 'none';
  }

  if (form) {
    form.reset();
    clearAllErrors('add');
  }
}

/**
 * Handle Create Department
 * Step 2: Connect Create - POST endpoint then re-fetch
 */
async function handleCreate(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const saveButton = document.getElementById('save-add-department-btn');

  const departmentName = formData.get('departmentName')?.trim() || '';
  const shortCode = formData.get('shortCode')?.trim().toUpperCase() || '';
  const status = formData.get('status') || 'ACTIVE';
  const defaultConsultationTimeMinutes = formData.get('defaultConsultationTimeMinutes') || '15';

  // Clear previous errors first
  clearAllErrors('add');

  // Validate - only show errors on submit
  const nameValid = validateDepartmentName(departmentName, 'add');
  const shortCodeValid = validateShortCode(shortCode, 'add', 'add');

  if (!nameValid || !shortCodeValid) {
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
    const response = await apiPost('/settings/departments', {
      name: departmentName,
      shortCode: shortCode,
      status: status,
      defaultConsultationTimeMinutes: parseInt(defaultConsultationTimeMinutes, 10) || 15,
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Success - re-fetch departments
      await fetchDepartments();

      // Close modal
      closeAddModal();

      // Show success toast
      toast.success('Department added successfully');
    } else {
      // Error from API
      const errorMessage = result.message || 'Failed to create department';
      toast.error(errorMessage);

      // Show field errors if provided
      if (result.errors) {
        Object.keys(result.errors).forEach((field) => {
          showFieldError('add', field, result.errors[field]);
        });
      }
    }
  } catch (error) {
    console.error('Error creating department:', error);
    toast.error('Failed to create department. Please try again.');
  } finally {
    // Re-enable button
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save';
    }
  }
}

/**
 * Open Edit Department Modal
 */
export function openEditModal(departmentId) {
  const department = departments.find((d) => d.id === departmentId);
  if (!department) {
    toast.error('Department not found');
    return;
  }

  const modal = document.getElementById('edit-department-modal');
  const form = document.getElementById('edit-department-form');
  const idInput = document.getElementById('edit-department-id');
  const nameInput = document.getElementById('edit-department-name');
  const shortCodeInput = document.getElementById('edit-department-short-code');
  const statusSelect = document.getElementById('edit-department-status');
  const consultationTimeInput = document.getElementById('edit-department-consultation-time');

  if (modal && form && idInput && nameInput && shortCodeInput && statusSelect) {
    // Populate form
    idInput.value = department.id;
    nameInput.value = department.name;
    shortCodeInput.value = department.shortCode;
    statusSelect.value = department.status;
    if (consultationTimeInput) {
      consultationTimeInput.value = department.defaultConsultationTimeMinutes || 15;
    }

    // Clear errors
    clearAllErrors('edit');

    // Show modal
    modal.style.display = 'flex';

    // Focus on first input
    setTimeout(() => nameInput.focus(), 100);

    // Enable save button - validation will happen on submit
    const saveButton = document.getElementById('save-edit-department-btn');
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

/**
 * Close Edit Department Modal
 */
function closeEditModal() {
  const modal = document.getElementById('edit-department-modal');
  const form = document.getElementById('edit-department-form');

  if (modal) {
    modal.style.display = 'none';
  }

  if (form) {
    form.reset();
    clearAllErrors('edit');
  }
}

/**
 * Handle Update Department
 * Step 3: Connect Update - PUT endpoint then re-fetch
 */
async function handleUpdate(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const saveButton = document.getElementById('save-edit-department-btn');

  const departmentId = formData.get('departmentId');
  const departmentName = formData.get('departmentName')?.trim() || '';
  const shortCode = formData.get('shortCode')?.trim().toUpperCase() || '';
  const status = formData.get('status') || 'ACTIVE';
  const defaultConsultationTimeMinutes = formData.get('defaultConsultationTimeMinutes') || null;

  if (!departmentId) {
    toast.error('Department ID is missing');
    return;
  }

  // Clear previous errors first
  clearAllErrors('edit');

  // Validate - only show errors on submit
  const nameValid = validateDepartmentName(departmentName, 'edit');
  const shortCodeValid = validateShortCode(shortCode, 'edit', 'edit');

  if (!nameValid || !shortCodeValid) {
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
    const updateData = {
      name: departmentName,
      shortCode: shortCode,
      status: status,
    };
    
    // Only include consultation time if it was provided
    if (defaultConsultationTimeMinutes !== null && defaultConsultationTimeMinutes !== '') {
      updateData.defaultConsultationTimeMinutes = parseInt(defaultConsultationTimeMinutes, 10);
    }
    
    const response = await apiPut(`/settings/departments/${departmentId}`, updateData);

    const result = await response.json();

    if (response.ok && result.success) {
      // Success - re-fetch departments
      await fetchDepartments();

      // Close modal
      closeEditModal();

      // Show success toast
      toast.success('Department updated successfully');
    } else {
      // Error from API
      const errorMessage = result.message || 'Failed to update department';
      toast.error(errorMessage);

      // Show field errors if provided
      if (result.errors) {
        Object.keys(result.errors).forEach((field) => {
          showFieldError('edit', field, result.errors[field]);
        });
      }
    }
  } catch (error) {
    console.error('Error updating department:', error);
    toast.error('Failed to update department. Please try again.');
  } finally {
    // Re-enable button
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save';
    }
  }
}

/**
 * Delete Department
 */
export function deleteDepartment(departmentId) {
  const department = departments.find((d) => d.id === departmentId);
  if (!department) {
    toast.error('Department not found');
    return;
  }

  // Show delete confirmation modal
  const modal = document.getElementById('delete-department-modal');
  const departmentNameElement = document.getElementById('delete-department-name');
  const confirmBtn = document.getElementById('confirm-delete-department-btn');

  if (modal && departmentNameElement && confirmBtn) {
    departmentNameElement.textContent = department.name;
    modal.style.display = 'flex';

    // Remove existing listeners and add new one
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
      handleDelete(departmentId);
    });
  }
}

/**
 * Handle Delete Department
 * Step 5: Connect Delete - DELETE endpoint then re-fetch
 */
async function handleDelete(departmentId) {
  const confirmBtn = document.getElementById('confirm-delete-department-btn');
  
  if (!departmentId) {
    toast.error('Department ID is missing');
    closeDeleteModal();
    return;
  }

  // Disable button and show loading state
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
  }

  try {
    // Call API
    const response = await apiDelete(`/settings/departments/${departmentId}`);
    const result = await response.json();

    if (response.ok && result.success) {
      // Success - re-fetch departments
      await fetchDepartments();

      // Close modal
      closeDeleteModal();

      // Show success toast
      toast.success('Department deleted successfully');
    } else {
      // Error from API
      const errorMessage = result.message || 'Failed to delete department';
      toast.error(errorMessage);
    }
  } catch (error) {
    console.error('Error deleting department:', error);
    toast.error('Failed to delete department. Please try again.');
  } finally {
    // Re-enable button
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete';
    }
  }
}

/**
 * Close Delete Modal
 */
function closeDeleteModal() {
  const modal = document.getElementById('delete-department-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Handle Toggle Department Status
 * Step 4: Connect Toggle - PATCH endpoint then re-fetch
 */
export async function handleToggle(departmentId) {
  const department = departments.find((d) => d.id === departmentId);
  if (!department) {
    toast.error('Department not found');
    return;
  }

  // Determine new status
  const currentStatus = department.status;
  const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  try {
    // Call API
    const response = await apiPatch(`/settings/departments/${departmentId}/status`, {
      status: newStatus,
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Success - re-fetch departments
      await fetchDepartments();

      // Show success toast
      toast.success('Department status updated successfully');
    } else {
      // Error from API
      const errorMessage = result.message || 'Failed to update department status';
      toast.error(errorMessage);
    }
  } catch (error) {
    console.error('Error toggling department status:', error);
    toast.error('Failed to update department status. Please try again.');
  }
}

/**
 * Clear all errors for a form
 */
function clearAllErrors(prefix) {
  clearFieldError(prefix, 'name');
  clearFieldError(prefix, 'short-code');
}
