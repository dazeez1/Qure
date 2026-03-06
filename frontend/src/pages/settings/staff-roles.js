/**
 * Staff & Roles Settings Handler
 * Handles staff table rendering, invite, edit, toggle active, and deactivate
 * Fully integrated with backend API
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { apiGet, apiPost, apiPut } from '../../utils/apiClient.js';
import { getAuthUser } from '../../utils/auth.js';

// Staff data - fetched from API
let staffMembers = [];
let departments = [];
let isLoading = false;
let canManageStaff = false; // Only primary staff or admin can manage

/**
 * Initialize Staff & Roles UI
 */
export function initStaffRolesUI() {
  // Check user permissions
  checkUserPermissions();

  // Set up event listeners
  setupEventListeners();

  // Fetch departments for dropdowns
  fetchDepartments();

  // Fetch staff from API
  fetchStaff();
}

/**
 * Check if user can manage staff (primary staff or admin)
 */
function checkUserPermissions() {
  const user = getAuthUser();
  if (user) {
    canManageStaff = user.isPrimary === true || user.role === 'ADMIN';
  } else {
    canManageStaff = false;
  }
}

/**
 * STEP 1: Fetch staff from API
 */
async function fetchStaff() {
  const tableBody = document.getElementById('staff-table-body');
  
  if (isLoading) return;
  isLoading = true;

  // Show loading state
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 4rem 2rem; color: #6b7280;">
          Loading staff...
        </td>
      </tr>
    `;
  }

  try {
    const response = await apiGet('/settings/staff');
    const result = await response.json();

    if (response.ok && result.success) {
      // Update staff array
      staffMembers = result.data || [];
      
      // Re-render table
      renderStaff();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to load staff');
      
      // Show error state
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 4rem 2rem; color: #dc2626;">
              Failed to load staff. Please try again.
            </td>
          </tr>
        `;
      }
      
      // Clear staff array on error
      staffMembers = [];
    }
  } catch (error) {
    console.error('Error fetching staff:', error);
    toast.error('Failed to load staff. Please try again.');
    
    // Show error state
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 4rem 2rem; color: #dc2626;">
            Failed to load staff. Please try again.
          </td>
        </tr>
      `;
    }
    
    // Clear staff array on error
    staffMembers = [];
  } finally {
    isLoading = false;
  }
}

/**
 * Fetch departments for dropdowns
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
    // Don't show toast - departments are optional for some roles
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Invite Staff button
  const inviteStaffBtn = document.getElementById('invite-staff-btn');
  if (inviteStaffBtn) {
    // Disable button for regular staff
    if (!canManageStaff) {
      inviteStaffBtn.disabled = true;
      inviteStaffBtn.style.opacity = '0.5';
      inviteStaffBtn.style.cursor = 'not-allowed';
      inviteStaffBtn.title = 'Only primary staff or administrators can invite staff';
    } else {
      inviteStaffBtn.addEventListener('click', openInviteModal);
    }
  }

  // Invite Staff form
  const inviteForm = document.getElementById('invite-staff-form');
  if (inviteForm) {
    inviteForm.addEventListener('submit', handleInviteStaff);
    setupFormValidation(inviteForm, 'invite');
  }

  // Edit Staff form
  const editForm = document.getElementById('edit-staff-form');
  if (editForm) {
    editForm.addEventListener('submit', handleEditStaff);
    setupFormValidation(editForm, 'edit');
  }

  // Modal close buttons
  setupModalCloseHandlers();

  // Auto lowercase email
  setupEmailInputs();
}

/**
 * Setup form validation
 */
function setupFormValidation(form, formType) {
  const prefix = formType === 'invite' ? 'invite' : 'edit';
  
  if (formType === 'invite') {
    const firstNameInput = document.getElementById(`${prefix}-first-name`);
    const lastNameInput = document.getElementById(`${prefix}-last-name`);
    const emailInput = document.getElementById(`${prefix}-email`);
    const roleInput = document.getElementById(`${prefix}-role`);

    if (firstNameInput) {
      firstNameInput.addEventListener('blur', () => {
        if (firstNameInput.value.trim().length > 0) {
          validateField(firstNameInput.value.trim(), prefix, 'first-name', 'First name is required');
        }
      });
    }

    if (lastNameInput) {
      lastNameInput.addEventListener('blur', () => {
        if (lastNameInput.value.trim().length > 0) {
          validateField(lastNameInput.value.trim(), prefix, 'last-name', 'Last name is required');
        }
      });
    }

    if (emailInput) {
      emailInput.addEventListener('blur', () => {
        if (emailInput.value.trim().length > 0) {
          validateEmail(emailInput.value.trim(), prefix);
        }
      });
    }

    if (roleInput) {
      roleInput.addEventListener('change', () => {
        validateField(roleInput.value, prefix, 'role', 'Role is required');
        toggleDepartmentField(roleInput.value, prefix);
      });
    }
  } else {
    const roleInput = document.getElementById(`${prefix}-staff-role`);
    if (roleInput) {
      roleInput.addEventListener('change', () => {
        validateField(roleInput.value, prefix, 'staff-role', 'Role is required');
        toggleDepartmentField(roleInput.value, prefix);
      });
    }
  }
}

/**
 * Toggle department field based on role
 */
function toggleDepartmentField(role, prefix) {
  const departmentSelect = document.getElementById(prefix === 'invite' ? 'invite-department' : 'edit-staff-department');
  const departmentLabel = departmentSelect?.previousElementSibling;
  
  if (role === 'ADMIN') {
    if (departmentSelect) {
      departmentSelect.value = '';
      departmentSelect.disabled = true;
      departmentSelect.style.opacity = '0.5';
    }
    if (departmentLabel) {
      departmentLabel.style.opacity = '0.5';
    }
  } else {
    if (departmentSelect) {
      departmentSelect.disabled = false;
      departmentSelect.style.opacity = '1';
    }
    if (departmentLabel) {
      departmentLabel.style.opacity = '1';
    }
  }
}

/**
 * Setup email inputs to auto-lowercase
 */
function setupEmailInputs() {
  const inviteEmailInput = document.getElementById('invite-email');

  if (inviteEmailInput) {
    inviteEmailInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toLowerCase();
    });
  }
}

/**
 * Validate field
 */
function validateField(value, prefix, fieldName, errorMessage) {
  if (!value || value.trim().length === 0) {
    showFieldError(prefix, fieldName, errorMessage);
    return false;
  }

  clearFieldError(prefix, fieldName);
  return true;
}

/**
 * Validate email
 */
function validateEmail(email, prefix) {
  if (!email || email.trim().length === 0) {
    showFieldError(prefix, 'email', 'Email is required');
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showFieldError(prefix, 'email', 'Please enter a valid email address');
    return false;
  }

  clearFieldError(prefix, 'email');
  return true;
}

/**
 * Show field error
 */
function showFieldError(prefix, fieldName, message) {
  const errorElement = document.getElementById(`${prefix}-${fieldName}-error`);
  const inputElement = document.getElementById(`${prefix}-${fieldName}`);

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
  const errorElement = document.getElementById(`${prefix}-${fieldName}-error`);
  const inputElement = document.getElementById(`${prefix}-${fieldName}`);

  if (errorElement) {
    errorElement.textContent = '';
  }

  if (inputElement) {
    inputElement.classList.remove('error');
  }
}

/**
 * Populate department dropdowns
 */
function populateDepartmentDropdowns() {
  const inviteDepartmentSelect = document.getElementById('invite-department');
  const editDepartmentSelect = document.getElementById('edit-staff-department');

  [inviteDepartmentSelect, editDepartmentSelect].forEach((select) => {
    if (select) {
      // Clear existing options except the first one
      const firstOption = select.querySelector('option[value=""]');
      select.innerHTML = '';
      if (firstOption) {
        select.appendChild(firstOption);
      }

      // Add department options
      departments.forEach((dept) => {
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = dept.name;
        select.appendChild(option);
      });
    }
  });
}

/**
 * Setup modal close handlers
 */
function setupModalCloseHandlers() {
  // Invite modal
  const inviteModal = document.getElementById('invite-staff-modal');
  const closeInviteModalBtn = document.getElementById('close-invite-modal');
  const cancelInviteBtn = document.getElementById('cancel-invite-staff-btn');

  if (closeInviteModalBtn) {
    closeInviteModalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeInviteModal();
    });
  }

  if (cancelInviteBtn) {
    cancelInviteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeInviteModal();
    });
  }

  if (inviteModal) {
    inviteModal.addEventListener('click', (e) => {
      if (e.target === inviteModal) {
        closeInviteModal();
      }
    });
  }

  // Edit modal
  const editModal = document.getElementById('edit-staff-modal');
  const closeEditModalBtn = document.getElementById('close-edit-staff-modal');
  const cancelEditBtn = document.getElementById('cancel-edit-staff-btn');

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

  // Delete/Deactivate modal
  const deleteModal = document.getElementById('delete-staff-modal');
  const closeDeleteModalBtn = document.getElementById('close-delete-staff-modal');
  const cancelDeleteBtn = document.getElementById('cancel-delete-staff-btn');

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
 * Render staff table from API data
 */
function renderStaff() {
  const tableBody = document.getElementById('staff-table-body');
  if (!tableBody) {
    return;
  }

  // Clear existing rows
  tableBody.innerHTML = '';

  // Render each staff member
  staffMembers.forEach((staff) => {
    const row = createStaffRow(staff);
    tableBody.appendChild(row);
  });

  // If no staff, show empty state
  if (staffMembers.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="5" style="text-align: center; padding: 4rem 2rem; color: #6b7280;">
        No staff members found. Click "Invite Staff" to add one.
      </td>
    `;
    tableBody.appendChild(emptyRow);
  }
}

/**
 * Create staff table row
 */
function createStaffRow(staff) {
  const row = document.createElement('tr');
  row.dataset.staffId = staff.id;
  
  if (!staff.isActive) {
    row.classList.add('inactive');
  }

  const statusClass = staff.isActive ? 'active' : 'inactive';
  const statusText = staff.isActive ? 'Active' : 'Inactive';
  
  // Map role and staffRole for display
  let roleText = '';
  let roleClass = '';
  if (staff.role === 'ADMIN') {
    roleText = 'Admin';
    roleClass = 'admin';
  } else if (staff.staffRole === 'DOCTOR') {
    roleText = 'Doctor';
    roleClass = 'doctor';
  } else if (staff.staffRole === 'NURSE') {
    roleText = 'Nurse';
    roleClass = 'nurse';
  } else {
    roleText = 'Staff';
    roleClass = 'staff';
  }

  const staffName = `${staff.firstName} ${staff.lastName}`;
  const departmentName = staff.department ? staff.department.name : '-';

  // UI Protection: Disable actions for Primary staff OR if user cannot manage staff
  const isPrimary = staff.isPrimary === true;
  const editDisabled = (isPrimary || !canManageStaff) ? 'disabled' : '';
  const deleteDisabled = (isPrimary || !canManageStaff) ? 'disabled' : '';
  const statusDisabled = (isPrimary || !canManageStaff) ? 'disabled' : '';
  
  // Tooltip messages
  let editTooltip = isPrimary ? 'Primary staff cannot be edited' : (!canManageStaff ? 'Only primary staff or administrators can edit staff' : 'Edit staff');
  let deleteTooltip = isPrimary ? 'Primary staff cannot be deactivated' : (!canManageStaff ? 'Only primary staff or administrators can deactivate staff' : 'Deactivate staff');
  let statusTooltip = isPrimary ? 'Primary staff cannot be deactivated' : (!canManageStaff ? 'Only primary staff or administrators can change status' : '');

  row.innerHTML = `
    <td>${escapeHtml(staffName)}</td>
    <td>${escapeHtml(staff.email)}</td>
    <td>
      <span class="role-badge ${roleClass}">${escapeHtml(roleText)}</span>
    </td>
    <td>
      <span class="status-badge ${statusClass} ${statusDisabled ? 'disabled' : ''}" 
            data-staff-id="${staff.id}" 
            data-status="${staff.isActive}"
            ${statusDisabled ? `title="${statusTooltip}"` : ''}
            ${statusDisabled ? 'style="cursor: default; opacity: 0.6;"' : ''}>
        ${escapeHtml(statusText)}
      </span>
    </td>
    <td>
      <div class="action-buttons">
        ${canManageStaff && !isPrimary ? `
        <button type="button" 
                class="action-btn edit-btn" 
                data-staff-id="${staff.id}" 
                title="${editTooltip}">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button type="button" 
                class="action-btn delete-btn" 
                data-staff-id="${staff.id}" 
                title="${deleteTooltip}">
          <span class="material-symbols-outlined">delete</span>
        </button>
        ` : `
        <button type="button" 
                class="action-btn edit-btn" 
                disabled 
                style="opacity: 0.5; cursor: not-allowed;" 
                title="${editTooltip}">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button type="button" 
                class="action-btn delete-btn" 
                disabled 
                style="opacity: 0.5; cursor: not-allowed;" 
                title="${deleteTooltip}">
          <span class="material-symbols-outlined">delete</span>
        </button>
        `}
      </div>
    </td>
  `;

  // Add event listeners
  const editBtn = row.querySelector('.edit-btn');
  const deleteBtn = row.querySelector('.delete-btn');
  const statusBadge = row.querySelector('.status-badge');

  if (editBtn && canManageStaff && !isPrimary && !editBtn.disabled) {
    editBtn.addEventListener('click', () => openEditModal(staff.id));
  }

  if (deleteBtn && canManageStaff && !isPrimary && !deleteBtn.disabled) {
    deleteBtn.addEventListener('click', () => deactivateStaff(staff.id));
  }

  if (statusBadge && canManageStaff && !isPrimary && !statusBadge.classList.contains('disabled')) {
    statusBadge.addEventListener('click', () => toggleStatus(staff.id));
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
 * Open Invite Staff Modal
 */
export function openInviteModal() {
  const modal = document.getElementById('invite-staff-modal');
  const form = document.getElementById('invite-staff-form');

  if (modal && form) {
    // Reset form
    form.reset();
    clearAllErrors('invite');

    // Reset department field
    const departmentSelect = document.getElementById('invite-department');
    if (departmentSelect) {
      departmentSelect.disabled = false;
      departmentSelect.style.opacity = '1';
    }

    // Show modal
    modal.style.display = 'flex';

    // Focus on first input
    const firstInput = document.getElementById('invite-first-name');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }

    // Enable invite button
    const inviteButton = document.getElementById('save-invite-staff-btn');
    if (inviteButton) {
      inviteButton.disabled = false;
    }
  }
}

/**
 * Close Invite Staff Modal
 */
function closeInviteModal() {
  const modal = document.getElementById('invite-staff-modal');
  const form = document.getElementById('invite-staff-form');

  if (modal) {
    modal.style.display = 'none';
  }

  if (form) {
    form.reset();
    clearAllErrors('invite');
  }
}

/**
 * STEP 2: Handle Invite Staff form submission
 */
async function handleInviteStaff(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const inviteButton = document.getElementById('save-invite-staff-btn');

  const firstName = formData.get('firstName')?.trim() || '';
  const lastName = formData.get('lastName')?.trim() || '';
  const email = formData.get('email')?.trim().toLowerCase() || '';
  const role = formData.get('role') || '';
  const departmentId = formData.get('department') || '';

  // Clear previous errors
  clearAllErrors('invite');

  // Validate
  const firstNameValid = validateField(firstName, 'invite', 'first-name', 'First name is required');
  const lastNameValid = validateField(lastName, 'invite', 'last-name', 'Last name is required');
  const emailValid = validateEmail(email, 'invite');
  const roleValid = validateField(role, 'invite', 'role', 'Role is required');

  if (!firstNameValid || !lastNameValid || !emailValid || !roleValid) {
    toast.error('Please fix the errors in the form');
    return;
  }

  // Validate role-specific requirements
  // DOCTOR and NURSE require department (they map to STAFF role in backend)
  if (role === 'DOCTOR' || role === 'NURSE') {
    if (!departmentId) {
      showFieldError('invite', 'department', 'Department is required for staff members');
      toast.error('Department is required for staff members');
      return;
    }
  }

  // Disable button and show loading state
  if (inviteButton) {
    inviteButton.disabled = true;
    inviteButton.textContent = 'Inviting...';
  }

  try {
    // Prepare request body
    // Map form role (DOCTOR/NURSE/ADMIN) to backend format (STAFF/ADMIN with staffRole)
    const requestBody = {
      firstName,
      lastName,
      email,
    };

    // Map role from form to backend format
    if (role === 'ADMIN') {
      requestBody.role = 'ADMIN';
      // ADMIN doesn't have staffRole or departmentId
    } else if (role === 'DOCTOR' || role === 'NURSE') {
      requestBody.role = 'STAFF';
      requestBody.staffRole = role; // DOCTOR or NURSE
      requestBody.departmentId = departmentId;
    }

    const response = await apiPost('/settings/staff/invite', requestBody);
    const result = await response.json();

    if (response.ok && result.success) {
      // Close modal
      closeInviteModal();

      // Show success toast
      toast.success(result.message || 'Invite sent successfully');

      // Re-fetch staff list
      await fetchStaff();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to invite staff. Please try again.');
    }
  } catch (error) {
    console.error('Error inviting staff:', error);
    toast.error('Failed to invite staff. Please try again.');
  } finally {
    // Re-enable button
    if (inviteButton) {
      inviteButton.disabled = false;
      inviteButton.textContent = 'Invite';
    }
  }
}

/**
 * Open Edit Staff Modal
 */
export function openEditModal(staffId) {
  const staff = staffMembers.find((s) => s.id === staffId);
  if (!staff) {
    toast.error('Staff member not found');
    return;
  }

  // Check if Primary - should be disabled in UI, but double-check
  if (staff.isPrimary) {
    toast.error('Primary staff cannot be edited');
    return;
  }

  const modal = document.getElementById('edit-staff-modal');
  const form = document.getElementById('edit-staff-form');
  const idInput = document.getElementById('edit-staff-id');
  const nameInput = document.getElementById('edit-staff-name');
  const emailInput = document.getElementById('edit-staff-email');
  const roleInput = document.getElementById('edit-staff-role');
  const departmentInput = document.getElementById('edit-staff-department');
  const activeCheckbox = document.getElementById('edit-staff-active');

  if (modal && form && idInput && nameInput && emailInput && roleInput && departmentInput && activeCheckbox) {
    // Populate form
    idInput.value = staff.id;
    nameInput.value = `${staff.firstName} ${staff.lastName}`;
    emailInput.value = staff.email;
    
    // Set role - map from backend format to form format
    if (staff.role === 'ADMIN') {
      roleInput.value = 'ADMIN';
    } else if (staff.staffRole === 'DOCTOR') {
      roleInput.value = 'DOCTOR';
    } else if (staff.staffRole === 'NURSE') {
      roleInput.value = 'NURSE';
    } else {
      roleInput.value = '';
    }
    
    activeCheckbox.checked = staff.isActive;

    // Set department if exists
    if (staff.department && staff.department.id) {
      departmentInput.value = staff.department.id;
    } else {
      departmentInput.value = '';
    }

    // Toggle department field based on role
    toggleDepartmentField(roleInput.value, 'edit');

    // Clear errors
    clearAllErrors('edit');

    // Show modal
    modal.style.display = 'flex';

    // Focus on role input
    setTimeout(() => roleInput.focus(), 100);

    // Enable save button
    const saveButton = document.getElementById('save-edit-staff-btn');
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

/**
 * Close Edit Staff Modal
 */
function closeEditModal() {
  const modal = document.getElementById('edit-staff-modal');
  const form = document.getElementById('edit-staff-form');

  if (modal) {
    modal.style.display = 'none';
  }

  if (form) {
    form.reset();
    clearAllErrors('edit');
  }
}

/**
 * STEP 3: Handle Edit Staff form submission
 */
async function handleEditStaff(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const saveButton = document.getElementById('save-edit-staff-btn');

  const staffId = formData.get('staffId');
  const role = formData.get('role') || '';
  const departmentId = formData.get('department') || '';
  const isActive = formData.get('isActive') === 'on';

  // Find staff
  const staff = staffMembers.find((s) => s.id === staffId);
  if (!staff) {
    toast.error('Staff member not found');
    return;
  }

  // Check if Primary
  if (staff.isPrimary) {
    toast.error('Primary staff cannot be edited');
    return;
  }

  // Clear previous errors
  clearAllErrors('edit');

  // Validate
  const roleValid = validateField(role, 'edit', 'staff-role', 'Role is required');

  if (!roleValid) {
    toast.error('Please fix the errors in the form');
    return;
  }

  // Validate role-specific requirements
  // DOCTOR and NURSE require department (they map to STAFF role in backend)
  if (role === 'DOCTOR' || role === 'NURSE') {
    if (!departmentId) {
      showFieldError('edit', 'department', 'Department is required for staff members');
      toast.error('Department is required for staff members');
      return;
    }
  }

  // Disable button and show loading state
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
  }

  try {
    // Build update body with only changed fields
    const updateBody = {};

    // Map role from form to backend format
    // Form has DOCTOR/NURSE/ADMIN, backend expects STAFF/ADMIN with staffRole
    if (role === 'ADMIN') {
      updateBody.role = 'ADMIN';
      // ADMIN doesn't have staffRole or departmentId
    } else if (role === 'DOCTOR' || role === 'NURSE') {
      updateBody.role = 'STAFF';
      updateBody.staffRole = role; // DOCTOR or NURSE
      updateBody.departmentId = departmentId;
    }

    // Add isActive if changed
    if (isActive !== staff.isActive) {
      updateBody.isActive = isActive;
    }

    const response = await apiPut(`/settings/staff/${staffId}`, updateBody);
    const result = await response.json();

    if (response.ok && result.success) {
      // Close modal
      closeEditModal();

      // Show success toast
      toast.success(result.message || 'Staff updated successfully');

      // Re-fetch staff list
      await fetchStaff();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to update staff. Please try again.');
    }
  } catch (error) {
    console.error('Error updating staff:', error);
    toast.error('Failed to update staff. Please try again.');
  } finally {
    // Re-enable button
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Save';
    }
  }
}

/**
 * STEP 4: Toggle Staff Status
 */
export async function toggleStatus(staffId) {
  const staff = staffMembers.find((s) => s.id === staffId);
  if (!staff) {
    toast.error('Staff member not found');
    return;
  }

  // Check if Primary
  if (staff.isPrimary) {
    toast.error('Primary staff cannot be deactivated');
    return;
  }

  const newStatus = !staff.isActive;

  try {
    const response = await apiPut(`/settings/staff/${staffId}`, {
      isActive: newStatus,
    });
    const result = await response.json();

    if (response.ok && result.success) {
      // Show success toast
      toast.success(result.message || `Staff member ${newStatus ? 'activated' : 'deactivated'} successfully`);

      // Re-fetch staff list
      await fetchStaff();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to update staff status. Please try again.');
    }
  } catch (error) {
    console.error('Error toggling staff status:', error);
    toast.error('Failed to update status');
  }
}

/**
 * STEP 5: Deactivate Staff (replaces delete)
 */
export function deactivateStaff(staffId) {
  const staff = staffMembers.find((s) => s.id === staffId);
  if (!staff) {
    toast.error('Staff member not found');
    return;
  }

  // Check if primary staff
  if (staff.isPrimary) {
    toast.error('Primary staff cannot be deactivated');
    return;
  }

  // Check if already inactive
  if (!staff.isActive) {
    toast.info('Staff member is already inactive');
    return;
  }

  // Show deactivate confirmation modal
  const modal = document.getElementById('delete-staff-modal');
  const staffNameElement = document.getElementById('delete-staff-name');
  const staffEmailElement = document.getElementById('delete-staff-email');
  const confirmBtn = document.getElementById('confirm-delete-staff-btn');

  if (modal && staffNameElement && staffEmailElement && confirmBtn) {
    // Update modal title and button text
    const modalTitle = modal.querySelector('.modal-title');
    if (modalTitle) {
      modalTitle.textContent = 'Deactivate Staff';
    }
    if (confirmBtn) {
      confirmBtn.textContent = 'Deactivate';
    }

    staffNameElement.textContent = `${staff.firstName} ${staff.lastName}`;
    staffEmailElement.textContent = staff.email;
    modal.style.display = 'flex';

    // Remove existing listeners and add new one
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
      confirmDeactivateStaff(staffId);
    });
  }
}

/**
 * Confirm Deactivate Staff
 */
async function confirmDeactivateStaff(staffId) {
  const staff = staffMembers.find((s) => s.id === staffId);
  if (!staff) {
    toast.error('Staff member not found');
    closeDeleteModal();
    return;
  }

  // Check if Primary
  if (staff.isPrimary) {
    toast.error('Primary staff cannot be deactivated');
    closeDeleteModal();
    return;
  }

  try {
    const response = await apiPut(`/settings/staff/${staffId}`, {
      isActive: false,
    });
    const result = await response.json();

    if (response.ok && result.success) {
      // Close modal
      closeDeleteModal();

      // Show success toast
      toast.success(result.message || 'Staff member deactivated successfully');

      // Re-fetch staff list
      await fetchStaff();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to deactivate staff. Please try again.');
    }
  } catch (error) {
    console.error('Error deactivating staff:', error);
    toast.error('Failed to deactivate staff');
  }
}

/**
 * Close Delete/Deactivate Modal
 */
function closeDeleteModal() {
  const modal = document.getElementById('delete-staff-modal');
  if (modal) {
    modal.style.display = 'none';
    
    // Reset modal title and button text (though they should already be "Deactivate")
    const modalTitle = modal.querySelector('.modal-title');
    if (modalTitle) {
      modalTitle.textContent = 'Deactivate Staff';
    }
    const confirmBtn = document.getElementById('confirm-delete-staff-btn');
    if (confirmBtn) {
      confirmBtn.textContent = 'Deactivate';
    }
  }
}

/**
 * Clear all errors for a form
 */
function clearAllErrors(prefix) {
  if (prefix === 'invite') {
    clearFieldError(prefix, 'first-name');
    clearFieldError(prefix, 'last-name');
    clearFieldError(prefix, 'email');
    clearFieldError(prefix, 'role');
    clearFieldError(prefix, 'department');
  } else {
    clearFieldError(prefix, 'staff-role');
    clearFieldError(prefix, 'department');
  }
}
