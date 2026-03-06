/**
 * Security Settings Handler
 * Handles access code toggle, reveal/hide, and regenerate functionality
 * Integrated with backend API
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { getAuthUser } from '../../utils/auth.js';
import { apiGet, apiPut, apiPost } from '../../utils/apiClient.js';

// State management
let securitySettings = {
  accessCodeRequired: true,
  accessCode: null,
  revealed: false,
};

// Track if form has been modified
let hasChanges = false;
let originalState = null;
let canManageSecurity = false; // Only primary staff can manage
let revealTimeout = null;
let isLoading = false;

/**
 * Initialize Security UI
 */
export function initSecurityUI() {
  // Clear any existing timeouts
  clearRevealTimeout();

  // Check user permissions
  checkUserPermissions();

  // Set up event listeners
  setupEventListeners();

  // Fetch settings from API
  fetchSecuritySettings();
}

/**
 * Fetch security settings from API
 */
async function fetchSecuritySettings() {
  if (isLoading) return;
  isLoading = true;

  try {
    const response = await apiGet('/settings/security');
    const result = await response.json();

    if (response.ok && result.success) {
      // Update state with API data
      securitySettings = {
        accessCodeRequired: result.data.accessCodeRequired ?? true,
        accessCode: result.data.accessCode || null, // null for non-Primary users
        revealed: false, // Always start hidden
      };

      // Store original state for comparison (include updatedAt for timestamp display)
      originalState = {
        accessCodeRequired: securitySettings.accessCodeRequired,
        updatedAt: result.data.updatedAt || null,
      };

      // Initialize form with fetched state
      renderForm();
    } else {
      toast.error(result.message || 'Failed to load security settings');
    }
  } catch (error) {
    console.error('Error fetching security settings:', error);
    toast.error('Failed to load settings');
  } finally {
    isLoading = false;
  }
}

/**
 * Check if user can manage security (primary staff only)
 */
function checkUserPermissions() {
  const user = getAuthUser();
  if (user) {
    canManageSecurity = user.isPrimary === true;
  } else {
    canManageSecurity = false;
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Access Code Required Toggle
  const accessCodeToggle = document.getElementById('access-code-required');
  if (accessCodeToggle) {
    accessCodeToggle.addEventListener('change', (e) => {
      securitySettings.accessCodeRequired = e.target.checked;
      updateAccessCodeSection();
      markAsChanged();
    });
  }

  // Reveal/Hide Button
  const revealBtn = document.getElementById('reveal-btn');
  if (revealBtn) {
    revealBtn.addEventListener('click', handleRevealToggle);
  }

  // Regenerate Button
  const regenerateBtn = document.getElementById('regenerate-btn');
  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', handleRegenerateClick);
  }

  // Cancel Button
  const cancelBtn = document.getElementById('cancel-security-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel);
  }

  // Save Changes Button
  const saveBtn = document.getElementById('save-security-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }

  // Regenerate Modal
  const regenerateModalOverlay = document.getElementById('regenerate-modal-overlay');
  const regenerateModalClose = document.getElementById('regenerate-modal-close');
  const regenerateModalCancel = document.getElementById('regenerate-modal-cancel');
  const regenerateModalConfirm = document.getElementById('regenerate-modal-confirm');

  if (regenerateModalOverlay) {
    regenerateModalOverlay.addEventListener('click', (e) => {
      if (e.target === regenerateModalOverlay) {
        closeRegenerateModal();
      }
    });
  }

  if (regenerateModalClose) {
    regenerateModalClose.addEventListener('click', (e) => {
      e.preventDefault();
      closeRegenerateModal();
    });
  }

  if (regenerateModalCancel) {
    regenerateModalCancel.addEventListener('click', (e) => {
      e.preventDefault();
      closeRegenerateModal();
    });
  }

  if (regenerateModalConfirm) {
    regenerateModalConfirm.addEventListener('click', handleRegenerateConfirm);
  }
}

/**
 * Render form with current state
 */
function renderForm() {
  // Access Code Required Toggle
  const accessCodeToggle = document.getElementById('access-code-required');
  if (accessCodeToggle) {
    accessCodeToggle.checked = securitySettings.accessCodeRequired;
    accessCodeToggle.disabled = !canManageSecurity;
  }

  // Update access code section visibility
  updateAccessCodeSection();

  // Access Code Display
  updateAccessCodeDisplay();

  // Regenerate Button
  const regenerateBtn = document.getElementById('regenerate-btn');
  if (regenerateBtn) {
    regenerateBtn.disabled = !canManageSecurity || !securitySettings.accessCodeRequired;
    regenerateBtn.title = !canManageSecurity
      ? 'Only primary staff can regenerate the access code'
      : !securitySettings.accessCodeRequired
      ? 'Enable access code requirement to regenerate'
      : 'Regenerate access code';
  }

  // Update timestamp if available
  const timestampEl = document.getElementById('access-code-timestamp');
  if (timestampEl) {
    if (originalState && originalState.updatedAt) {
      // Format the updatedAt timestamp from API
      try {
        const updatedDate = new Date(originalState.updatedAt);
        timestampEl.textContent = `Last updated: ${updatedDate.toLocaleString()}`;
      } catch (e) {
        // If timestamp parsing fails, show default
        timestampEl.textContent = 'Last updated: Unknown';
      }
    } else {
      // No timestamp available yet
      timestampEl.textContent = 'Last updated: Just now';
    }
  }

  // Update save button state
  updateSaveButtonState();
}

/**
 * Update access code section based on toggle state
 */
function updateAccessCodeSection() {
  const accessCodeSection = document.getElementById('access-code-section');
  const accessCodeHelper = document.getElementById('access-code-helper');
  const regenerateBtn = document.getElementById('regenerate-btn');

  if (!accessCodeSection || !accessCodeHelper) return;

  if (securitySettings.accessCodeRequired) {
    // Toggle is ON - show section
    accessCodeSection.classList.remove('faded');
    accessCodeHelper.textContent =
      'When enabled, staff must enter the hospital access code before accessing the staff dashboard.';

    if (regenerateBtn) {
      regenerateBtn.disabled = !canManageSecurity;
    }
  } else {
    // Toggle is OFF - fade section
    accessCodeSection.classList.add('faded');
    accessCodeHelper.textContent = 'Shared access code disabled';

    if (regenerateBtn) {
      regenerateBtn.disabled = true;
    }

    // Auto-hide code if revealed
    if (securitySettings.revealed) {
      securitySettings.revealed = false;
      clearRevealTimeout();
      updateAccessCodeDisplay();
    }
  }
}

/**
 * Update access code display
 */
function updateAccessCodeDisplay() {
  const accessCodeValue = document.getElementById('access-code-value');
  const revealBtn = document.getElementById('reveal-btn');
  const revealBtnText = document.getElementById('reveal-btn-text');

  if (accessCodeValue) {
    if (securitySettings.revealed) {
      accessCodeValue.textContent = securitySettings.accessCode;
    } else {
      accessCodeValue.textContent = '••••••••';
    }
  }

  if (revealBtn && revealBtnText) {
    const isDisabled = !securitySettings.accessCodeRequired || !canManageSecurity;
    revealBtn.disabled = isDisabled;
    revealBtnText.textContent = securitySettings.revealed ? 'Hide' : 'Reveal';
    
    // Set tooltip based on disabled reason
    if (!canManageSecurity) {
      revealBtn.title = 'Only primary staff can reveal the access code';
    } else if (!securitySettings.accessCodeRequired) {
      revealBtn.title = 'Enable access code requirement to reveal';
    } else {
      revealBtn.title = securitySettings.revealed ? 'Hide access code' : 'Reveal access code';
    }
    
    // Update icon
    const icon = revealBtn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = securitySettings.revealed ? 'visibility_off' : 'visibility';
    }
  }
}

/**
 * Handle reveal/hide toggle
 */
function handleRevealToggle() {
  if (!securitySettings.accessCodeRequired || !canManageSecurity) return;

  securitySettings.revealed = !securitySettings.revealed;
  updateAccessCodeDisplay();

  // Auto-hide after 10 seconds if revealed
  if (securitySettings.revealed) {
    clearRevealTimeout();
    revealTimeout = setTimeout(() => {
      securitySettings.revealed = false;
      updateAccessCodeDisplay();
      toast.info('Access code hidden automatically');
    }, 10000);
  } else {
    clearRevealTimeout();
  }
}

/**
 * Clear reveal timeout
 */
function clearRevealTimeout() {
  if (revealTimeout) {
    clearTimeout(revealTimeout);
    revealTimeout = null;
  }
}

/**
 * Handle regenerate button click
 */
function handleRegenerateClick() {
  if (!canManageSecurity || !securitySettings.accessCodeRequired) return;

  openRegenerateModal();
}

/**
 * Open regenerate confirmation modal
 */
function openRegenerateModal() {
  const modal = document.getElementById('regenerate-modal-overlay');
  if (modal) {
    modal.style.display = 'flex';
  }
}

/**
 * Close regenerate confirmation modal
 */
function closeRegenerateModal() {
  const modal = document.getElementById('regenerate-modal-overlay');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Handle regenerate confirmation
 */
async function handleRegenerateConfirm() {
  const confirmBtn = document.getElementById('regenerate-modal-confirm');
  if (!confirmBtn) return;

  // Show loading state
  const originalContent = confirmBtn.innerHTML;
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 1.2rem; margin-right: 0.4rem;">hourglass_empty</span>
    Regenerating...
  `;

  try {
    // Call API to regenerate access code
    const response = await apiPost('/settings/security/regenerate', {});
    const result = await response.json();

    if (response.ok && result.success) {
      // Update state with new access code from API
      securitySettings.accessCode = result.data.accessCode;

      // Auto-hide if currently revealed
      if (securitySettings.revealed) {
        securitySettings.revealed = false;
        clearRevealTimeout();
      }

      // Auto-reveal for 10 seconds
      securitySettings.revealed = true;
      updateAccessCodeDisplay();

      // Set auto-hide timeout
      clearRevealTimeout();
      revealTimeout = setTimeout(() => {
        securitySettings.revealed = false;
        updateAccessCodeDisplay();
        toast.info('Access code hidden automatically');
      }, 10000);

      // Update timestamp (use current time since API doesn't return updatedAt for regenerate)
      const timestampEl = document.getElementById('access-code-timestamp');
      if (timestampEl) {
        const now = new Date();
        timestampEl.textContent = `Last updated: ${now.toLocaleString()}`;
        // Also update originalState for consistency
        if (originalState) {
          originalState.updatedAt = now.toISOString();
        }
      }

      // Close modal
      closeRegenerateModal();

      // Show success toast
      toast.success(result.message || 'Access code regenerated successfully');
    } else {
      // Error from API
      toast.error(result.message || 'Failed to regenerate access code. Please try again.');
    }
  } catch (error) {
    console.error('Error regenerating access code:', error);
    toast.error('Failed to regenerate code');
  } finally {
    // Re-enable button
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalContent;
  }
}

/**
 * Generate random access code (mock)
 */
function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Mark form as changed
 */
function markAsChanged() {
  hasChanges = true;
  updateSaveButtonState();
}

/**
 * Check if form has changes
 */
function checkForChanges() {
  if (!originalState) return false;
  hasChanges =
    securitySettings.accessCodeRequired !== originalState.accessCodeRequired;
  return hasChanges;
}

/**
 * Update save button state
 */
function updateSaveButtonState() {
  const saveBtn = document.getElementById('save-security-btn');
  if (saveBtn) {
    const hasChanges = checkForChanges();
    saveBtn.disabled = !hasChanges || !canManageSecurity;
    saveBtn.title = !canManageSecurity
      ? 'Only primary staff can save security settings'
      : !hasChanges
      ? 'No changes to save'
      : 'Save security settings';
  }
}

/**
 * Handle Cancel button click
 */
function handleCancel() {
  // Check if there are unsaved changes
  if (hasChanges) {
    // Reset to original state
    securitySettings.accessCodeRequired = originalState.accessCodeRequired;
    hasChanges = false;
    renderForm();
    toast.info('Changes discarded');
  }
}

/**
 * Handle Save Changes button click
 */
async function handleSave() {
  const saveBtn = document.getElementById('save-security-btn');

  // Check if there are changes
  if (!hasChanges) {
    toast.info('No changes to save');
    return;
  }

  // Check permissions
  if (!canManageSecurity) {
    toast.error('Only primary staff can save security settings');
    return;
  }

  // Disable button during "saving"
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Update original state (simulating successful save)
  originalState = JSON.parse(JSON.stringify(securitySettings));
  hasChanges = false;

  // Show success toast
  toast.success('Security settings saved successfully!');

  // Re-enable button
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }

  // Update save button state
  updateSaveButtonState();
}
