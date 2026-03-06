/**
 * Notifications Settings Handler
 * Handles notifications UI with full state management
 * Integrated with backend API
 */

'use strict';

import { toast } from '../../utils/toast.js';
import { apiGet, apiPost, apiPut } from '../../utils/apiClient.js';
import { getAuthUser } from '../../utils/auth.js';

// State management
let notificationsState = {
  patientEmailEnabled: true,
  patientEmailTemplate: 'Hello [PatientName], this is a reminder of your appointment on [AppointmentDate] at [AppointmentTime] in [Department]. Please arrive 10 minutes early.',
  staffAnnouncementsEnabled: true,
  staffOvercapacityEnabled: true,
};

// Track if form has been modified
let hasChanges = false;
let originalState = null;
let isLoading = false;
let canManageNotifications = false; // Only primary staff or admin can manage

/**
 * Initialize Notifications UI
 */
export function initNotificationsUI() {
  // Check user permissions
  checkUserPermissions();

  // Set up event listeners
  setupEventListeners();

  // Fetch settings from API
  fetchNotificationSettings();
}

/**
 * Check if user can manage notifications (primary staff or admin)
 */
function checkUserPermissions() {
  const user = getAuthUser();
  if (user) {
    canManageNotifications = user.isPrimary === true || user.role === 'ADMIN';
  } else {
    canManageNotifications = false;
  }
}

/**
 * Fetch notification settings from API
 */
async function fetchNotificationSettings() {
  if (isLoading) return;
  isLoading = true;

  try {
    const response = await apiGet('/settings/notifications');
    const result = await response.json();

    if (response.ok && result.success) {
      // Update state with API data
      notificationsState = {
        patientEmailEnabled: result.data.patientEmailEnabled ?? true,
        patientEmailTemplate: result.data.patientEmailTemplate || '',
        staffAnnouncementsEnabled: result.data.staffAnnouncementsEnabled ?? true,
        staffOvercapacityEnabled: result.data.staffOvercapacityEnabled ?? true,
      };

      // Store original state for comparison
      originalState = JSON.parse(JSON.stringify(notificationsState));

      // Initialize form with fetched state
      renderForm();
    } else {
      toast.error(result.message || 'Failed to load notification settings');
    }
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    toast.error('Failed to load settings');
  } finally {
    isLoading = false;
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Patient Email checkbox
  const patientEmailCheckbox = document.getElementById('patient-email-enabled');
  if (patientEmailCheckbox) {
    patientEmailCheckbox.addEventListener('change', (e) => {
      notificationsState.patientEmailEnabled = e.target.checked;
      updateEmailTemplateState();
      markAsChanged();
    });
  }

  // Patient Email template
  const patientEmailTemplate = document.getElementById('patient-email-template');
  if (patientEmailTemplate) {
    patientEmailTemplate.addEventListener('input', (e) => {
      notificationsState.patientEmailTemplate = e.target.value;
      markAsChanged();
    });
  }

  // Staff Announcements checkbox
  const staffAnnouncementsCheckbox = document.getElementById('staff-announcements-enabled');
  if (staffAnnouncementsCheckbox) {
    staffAnnouncementsCheckbox.addEventListener('change', (e) => {
      notificationsState.staffAnnouncementsEnabled = e.target.checked;
      markAsChanged();
    });
  }

  // Staff Overcapacity checkbox
  const staffOvercapacityCheckbox = document.getElementById('staff-overcapacity-enabled');
  if (staffOvercapacityCheckbox) {
    staffOvercapacityCheckbox.addEventListener('change', (e) => {
      notificationsState.staffOvercapacityEnabled = e.target.checked;
      markAsChanged();
    });
  }

  // Send Test button
  const sendTestBtn = document.getElementById('send-test-btn');
  if (sendTestBtn) {
    sendTestBtn.addEventListener('click', handleSendTest);
  }

  // Cancel button
  const cancelBtn = document.getElementById('cancel-notifications-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel);
  }

  // Save Changes button
  const saveBtn = document.getElementById('save-notifications-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }
}

/**
 * Render form with current state
 */
function renderForm() {
  // Patient Email checkbox
  const patientEmailCheckbox = document.getElementById('patient-email-enabled');
  if (patientEmailCheckbox) {
    patientEmailCheckbox.checked = notificationsState.patientEmailEnabled;
  }

  // Patient Email template
  const patientEmailTemplate = document.getElementById('patient-email-template');
  if (patientEmailTemplate) {
    patientEmailTemplate.value = notificationsState.patientEmailTemplate || '';
    updateEmailTemplateState();
  }

  // Staff Announcements checkbox
  const staffAnnouncementsCheckbox = document.getElementById('staff-announcements-enabled');
  if (staffAnnouncementsCheckbox) {
    staffAnnouncementsCheckbox.checked = notificationsState.staffAnnouncementsEnabled;
  }

  // Staff Overcapacity checkbox
  const staffOvercapacityCheckbox = document.getElementById('staff-overcapacity-enabled');
  if (staffOvercapacityCheckbox) {
    staffOvercapacityCheckbox.checked = notificationsState.staffOvercapacityEnabled;
  }

  // Send Test button - disable for regular staff
  const sendTestBtn = document.getElementById('send-test-btn');
  if (sendTestBtn) {
    if (!canManageNotifications) {
      sendTestBtn.disabled = true;
      sendTestBtn.title = 'Only primary staff or administrators can test email notifications';
    } else {
      sendTestBtn.disabled = false;
      sendTestBtn.title = 'Send test email notification';
    }
  }

  // Update save button state
  updateSaveButtonState();
}

/**
 * Update email template input state based on checkbox
 */
function updateEmailTemplateState() {
  const patientEmailCheckbox = document.getElementById('patient-email-enabled');
  const patientEmailTemplate = document.getElementById('patient-email-template');

  if (patientEmailCheckbox && patientEmailTemplate) {
    const isEnabled = patientEmailCheckbox.checked;
    patientEmailTemplate.disabled = !isEnabled;
  }
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
  hasChanges = JSON.stringify(notificationsState) !== JSON.stringify(originalState);
  return hasChanges;
}

/**
 * Update save button state
 */
function updateSaveButtonState() {
  const saveBtn = document.getElementById('save-notifications-btn');
  if (saveBtn) {
    const hasChanges = checkForChanges();
    saveBtn.disabled = !hasChanges;
  }
}

/**
 * Handle Send Test button click
 */
async function handleSendTest() {
  const sendTestBtn = document.getElementById('send-test-btn');
  
  // Disable button during request
  if (sendTestBtn) {
    sendTestBtn.disabled = true;
    const originalContent = sendTestBtn.innerHTML;
    sendTestBtn.innerHTML = `
      <span class="material-symbols-outlined" style="font-size: 1.2rem; margin-right: 0.4rem;">mail</span>
      Sending...
    `;
  }

  try {
    const response = await apiPost('/settings/notifications/test-email', {});
    const result = await response.json();

    if (response.ok && result.success) {
      // Show success toast
      toast.success('Email rendered successfully');
    } else {
      // Error from API
      toast.error(result.message || 'Failed to send test email. Please try again.');
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    toast.error('Failed to send test email. Please try again.');
  } finally {
    // Re-enable button
    if (sendTestBtn) {
      sendTestBtn.disabled = false;
      sendTestBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 1.2rem; margin-right: 0.4rem;">mail</span>
        Send Test
      `;
    }
  }
}

/**
 * Handle Cancel button click
 */
function handleCancel() {
  // Check if there are unsaved changes
  if (hasChanges) {
    // In a real app, you might show a confirmation dialog
    // For now, just reset to original state
    notificationsState = JSON.parse(JSON.stringify(originalState));
    hasChanges = false;
    renderForm();
    toast.info('Changes discarded');
  }
}

/**
 * Handle Save Changes button click
 */
async function handleSave() {
  const saveBtn = document.getElementById('save-notifications-btn');

  // Check if there are changes
  if (!hasChanges) {
    toast.info('No changes to save');
    return;
  }

  // Disable button during request
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    // Build request body with only changed fields
    const requestBody = {};

    if (notificationsState.patientEmailEnabled !== originalState?.patientEmailEnabled) {
      requestBody.patientEmailEnabled = notificationsState.patientEmailEnabled;
    }

    if (notificationsState.patientEmailTemplate !== originalState?.patientEmailTemplate) {
      requestBody.patientEmailTemplate = notificationsState.patientEmailTemplate;
    }

    if (notificationsState.staffAnnouncementsEnabled !== originalState?.staffAnnouncementsEnabled) {
      requestBody.staffAnnouncementsEnabled = notificationsState.staffAnnouncementsEnabled;
    }

    if (notificationsState.staffOvercapacityEnabled !== originalState?.staffOvercapacityEnabled) {
      requestBody.staffOvercapacityEnabled = notificationsState.staffOvercapacityEnabled;
    }

    const response = await apiPut('/settings/notifications', requestBody);
    const result = await response.json();

    if (response.ok && result.success) {
      // Update original state (successful save)
      originalState = JSON.parse(JSON.stringify(notificationsState));
      hasChanges = false;

      // Show success toast
      toast.success(result.message || 'Notification settings saved successfully!');

      // Update save button state
      updateSaveButtonState();
    } else {
      // Error from API
      toast.error(result.message || 'Failed to save notification settings. Please try again.');
    }
  } catch (error) {
    console.error('Error saving notification settings:', error);
    toast.error('Failed to save settings');
  } finally {
    // Re-enable button
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  }
}
